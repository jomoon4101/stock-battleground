export const APP_TABS = Object.freeze(["home", "market", "trade", "survivors", "logs"]);

let activeTab = null;
const sheetFocusOrigins = new WeakMap();
const openSheetStack = [];
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const FOCUS_FALLBACK_SELECTOR = '[data-app-tab][aria-current="page"], #global-chat-toggle, #start-button';

export function getActiveAppTab() {
  return activeTab;
}

export function setActiveAppTab(tabName) {
  if (!APP_TABS.includes(tabName)) return activeTab;

  const changed = activeTab !== tabName;
  activeTab = tabName;

  document.querySelectorAll("[data-app-tab]").forEach((button) => {
    const isActive = button.dataset.appTab === activeTab;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== activeTab;
  });

  if (changed) {
    document.dispatchEvent(new CustomEvent("stock-survival:tab-change", {
      detail: { tab: activeTab },
    }));
  }

  return activeTab;
}

function syncBodySheetState() {
  const hasOpenSheet = [...document.querySelectorAll(".modal-backdrop, .global-chat-sheet")]
    .some((sheet) => !sheet.classList.contains("is-hidden"));
  document.body.classList.toggle("has-open-sheet", hasOpenSheet);
}

function visibleSheets() {
  return [...document.querySelectorAll(".modal-backdrop, .global-chat-sheet")]
    .filter((sheet) => !sheet.classList.contains("is-hidden"));
}

function topOpenSheet() {
  for (let index = openSheetStack.length - 1; index >= 0; index -= 1) {
    const sheet = openSheetStack[index];
    if (!sheet.classList.contains("is-hidden")) return sheet;
  }
  return visibleSheets().at(-1) ?? null;
}

function isVisibleFocusTarget(element) {
  if (!element?.isConnected || typeof element.focus !== "function") return false;
  if (element.disabled || element.matches?.(":disabled") || element.getAttribute?.("aria-disabled") === "true") return false;
  if (String(element.type || element.getAttribute?.("type") || "").toLowerCase() === "hidden") return false;
  let ancestor = element;
  while (ancestor) {
    if (ancestor.hidden || ancestor.inert || ancestor.classList?.contains("is-hidden")
      || ancestor.getAttribute?.("aria-hidden") === "true") return false;
    const style = typeof globalThis.getComputedStyle === "function"
      ? globalThis.getComputedStyle(ancestor)
      : ancestor.style;
    if (style?.display === "none" || ["hidden", "collapse"].includes(style?.visibility)) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function tryFocus(element) {
  if (!isVisibleFocusTarget(element)) return false;
  element.focus();
  return document.activeElement === element;
}

function focusableElements(sheet) {
  return [...sheet.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisibleFocusTarget);
}

function focusSheet(sheet) {
  const autofocus = sheet.querySelector?.("[autofocus]");
  if (autofocus && tryFocus(autofocus)) return true;
  for (const target of focusableElements(sheet)) {
    if (tryFocus(target)) return true;
  }
  if (sheet.getAttribute("tabindex") === null) sheet.setAttribute("tabindex", "-1");
  return tryFocus(sheet);
}

function focusLiveFallback() {
  const liveSheet = topOpenSheet();
  if (liveSheet && focusSheet(liveSheet)) return true;
  for (const control of document.querySelectorAll(FOCUS_FALLBACK_SELECTOR)) {
    if (tryFocus(control)) return true;
  }
  return false;
}

function rewireNestedFocusOrigins(closingSheet) {
  const replacement = sheetFocusOrigins.get(closingSheet);
  for (const openSheet of openSheetStack) {
    if (openSheet === closingSheet) continue;
    const origin = sheetFocusOrigins.get(openSheet);
    if (origin && closingSheet.contains(origin)) sheetFocusOrigins.set(openSheet, replacement);
  }
}

function setTriggerExpanded(sheet, expanded) {
  document.querySelectorAll(`[aria-controls="${sheet.id}"]`).forEach((trigger) => {
    trigger.setAttribute("aria-expanded", String(expanded));
  });
}

export function openSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return false;
  const wasHidden = sheet.classList.contains("is-hidden");
  if (wasHidden) sheetFocusOrigins.set(sheet, document.activeElement);
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-hidden", "false");
  sheet.classList.remove("is-hidden");
  const previousIndex = openSheetStack.indexOf(sheet);
  if (previousIndex >= 0) openSheetStack.splice(previousIndex, 1);
  openSheetStack.push(sheet);
  setTriggerExpanded(sheet, true);
  syncBodySheetState();
  if (wasHidden) focusSheet(sheet);
  return true;
}

export function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return false;
  const wasOpen = !sheet.classList.contains("is-hidden");
  const wasTopSheet = topOpenSheet() === sheet;
  rewireNestedFocusOrigins(sheet);
  sheet.classList.add("is-hidden");
  sheet.setAttribute("aria-hidden", "true");
  const stackIndex = openSheetStack.indexOf(sheet);
  if (stackIndex >= 0) openSheetStack.splice(stackIndex, 1);
  setTriggerExpanded(sheet, false);
  syncBodySheetState();
  if (!wasOpen) return true;

  document.dispatchEvent(new CustomEvent("stock-survival:sheet-close", {
    detail: { id: sheet.id },
  }));
  if (wasTopSheet) {
    const focusOrigin = sheetFocusOrigins.get(sheet);
    if (!tryFocus(focusOrigin)) focusLiveFallback();
  }
  sheetFocusOrigins.delete(sheet);
  return true;
}

document.addEventListener("click", (event) => {
  const closeControl = event.target.closest?.("[data-sheet-close]");
  if (closeControl) {
    const sheet = closeControl.closest(".modal-backdrop, .global-chat-sheet");
    if (sheet) closeSheet(sheet.id);
    return;
  }
  const sheet = event.target.closest?.(".modal-backdrop, .global-chat-sheet");
  if (sheet && event.target === sheet) closeSheet(sheet.id);
});

document.addEventListener("keydown", (event) => {
  const sheet = topOpenSheet();
  if (!sheet) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    closeSheet(sheet.id);
    return;
  }
  if (event.key !== "Tab") return;

  const focusables = focusableElements(sheet);
  if (!focusables.length) {
    event.preventDefault();
    focusSheet(sheet);
    return;
  }
  const first = focusables[0];
  const last = focusables.at(-1);
  const activeElement = document.activeElement;
  if (event.shiftKey && (activeElement === first || !sheet.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || !sheet.contains(activeElement))) {
    event.preventDefault();
    first.focus();
  }
});

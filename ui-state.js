export const APP_TABS = Object.freeze(["home", "market", "trade", "survivors", "logs"]);

let activeTab = null;
const sheetFocusOrigins = new WeakMap();
const openSheetStack = [];
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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

function focusableElements(sheet) {
  return [...sheet.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter((element) => !element.closest?.(".is-hidden, [hidden]"));
}

function focusSheet(sheet) {
  const target = sheet.querySelector?.("[autofocus]") || focusableElements(sheet)[0];
  if (target) {
    target.focus();
    return;
  }
  if (sheet.getAttribute("tabindex") === null) sheet.setAttribute("tabindex", "-1");
  sheet.focus?.();
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
    if (focusOrigin?.isConnected !== false && typeof focusOrigin?.focus === "function") focusOrigin.focus();
    else if (topOpenSheet()) focusSheet(topOpenSheet());
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

export const APP_TABS = Object.freeze(["home", "market", "trade", "survivors", "logs"]);

let activeTab = null;

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

export function openSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return false;
  sheet.classList.remove("is-hidden");
  syncBodySheetState();
  return true;
}

export function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return false;
  sheet.classList.add("is-hidden");
  syncBodySheetState();
  return true;
}

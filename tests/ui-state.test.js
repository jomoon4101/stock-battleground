import test from "node:test";
import assert from "node:assert/strict";

let importSequence = 0;

function createClassList(initialClasses, mutate) {
  const classes = new Set(initialClasses);
  return {
    add(...names) {
      names.forEach((name) => classes.add(name));
      mutate();
    },
    remove(...names) {
      names.forEach((name) => classes.delete(name));
      mutate();
    },
    toggle(name, force) {
      const next = force === undefined ? !classes.has(name) : Boolean(force);
      if (next) classes.add(name);
      else classes.delete(name);
      mutate();
      return next;
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createFakeDocument({ appTabs = [], tabPanels = [], sheets = [] } = {}) {
  let mutations = 0;
  const events = [];
  const listeners = new Map();
  const mutate = () => { mutations += 1; };
  let document;
  const createElement = ({ id = "", classes = [], dataset = {}, focusable = false, tagName = "DIV" }) => {
    const attributes = new Map();
    let hidden = false;
    const element = {
      id,
      dataset,
      tagName,
      disabled: false,
      focusable,
      children: [],
      parentElement: null,
      isConnected: true,
      classList: createClassList(classes, mutate),
      append(...children) {
        children.forEach((child) => {
          child.parentElement = element;
          element.children.push(child);
        });
      },
      contains(candidate) {
        return candidate === element || element.children.some((child) => child.contains(candidate));
      },
      closest(selector) {
        let candidate = element;
        while (candidate) {
          if (selector === ".modal-backdrop, .global-chat-sheet"
            && (candidate.classList.contains("modal-backdrop") || candidate.classList.contains("global-chat-sheet"))) return candidate;
          if (selector === "[data-sheet-close]" && Object.hasOwn(candidate.dataset, "sheetClose")) return candidate;
          if (selector === ".sheet-card" && candidate.classList.contains("sheet-card")) return candidate;
          candidate = candidate.parentElement;
        }
        return null;
      },
      querySelectorAll() {
        const descendants = [];
        const visit = (node) => {
          node.children.forEach((child) => {
            if (child.focusable && !child.disabled) descendants.push(child);
            visit(child);
          });
        };
        visit(element);
        return descendants;
      },
      querySelector() {
        return element.querySelectorAll()[0] ?? null;
      },
      focus() {
        document.activeElement = element;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        mutate();
      },
      removeAttribute(name) {
        attributes.delete(name);
        mutate();
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      get hidden() {
        return hidden;
      },
      set hidden(value) {
        hidden = Boolean(value);
        mutate();
      },
    };
    return element;
  };
  const tabs = appTabs.map((tab) => createElement({ dataset: { appTab: tab } }));
  const panels = tabPanels.map((tab) => createElement({ dataset: { tabPanel: tab } }));
  const sheetElements = sheets.map(({ id, open = false, type = "modal", controls = 2 }) => {
    const sheet = createElement({
      id,
      classes: [type === "chat" ? "global-chat-sheet" : "modal-backdrop", ...(open ? [] : ["is-hidden"])],
    });
    const card = createElement({ id: `${id}-card`, classes: ["sheet-card"] });
    const focusables = Array.from({ length: controls }, (_, index) => createElement({
      id: `${id}-control-${index + 1}`,
      focusable: true,
      tagName: "BUTTON",
    }));
    card.append(...focusables);
    sheet.append(card);
    sheet.card = card;
    sheet.focusables = focusables;
    return sheet;
  });
  const allElements = [];
  const collect = (element) => {
    allElements.push(element);
    element.children.forEach(collect);
  };
  sheetElements.forEach(collect);
  const elementsById = new Map(allElements.map((element) => [element.id, element]));
  const body = createElement({});
  const outside = createElement({ id: "outside-trigger", focusable: true, tagName: "BUTTON" });
  const triggers = sheetElements.map((sheet) => {
    const trigger = createElement({ id: `${sheet.id}-trigger`, focusable: true, tagName: "BUTTON" });
    trigger.setAttribute("aria-controls", sheet.id);
    return trigger;
  });
  document = {
    body,
    activeElement: body,
    querySelectorAll(selector) {
      if (selector === "[data-app-tab]") return tabs;
      if (selector === "[data-tab-panel]") return panels;
      if (selector === ".modal-backdrop, .global-chat-sheet") return sheetElements;
      const ariaControls = selector.match(/^\[aria-controls="(.+)"\]$/);
      if (ariaControls) return triggers.filter((trigger) => trigger.getAttribute("aria-controls") === ariaControls[1]);
      return [];
    },
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
    dispatchEvent(event) {
      events.push(event);
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  const dispatch = (type, options = {}) => {
    const event = {
      type,
      target: options.target ?? document.activeElement,
      key: options.key,
      shiftKey: Boolean(options.shiftKey),
      defaultPrevented: false,
      immediatePropagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.immediatePropagationStopped = true; },
    };
    document.dispatchEvent(event);
    return event;
  };
  return {
    document,
    events,
    outside,
    triggers,
    dispatch,
    get mutations() {
      return mutations;
    },
    resetMutations() {
      mutations = 0;
    },
    getElementById(id) {
      return elementsById.get(id);
    },
  };
}

async function withUiState(fakeDocument, run) {
  const originalDocument = globalThis.document;
  const originalCustomEvent = globalThis.CustomEvent;
  globalThis.document = fakeDocument;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  try {
    const moduleUrl = new URL("../ui-state.js?test=" + importSequence++, import.meta.url);
    await run(await import(moduleUrl));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = originalCustomEvent;
  }
}

test("an invalid app tab returns the current tab without DOM mutation or events", async () => {
  const fake = createFakeDocument({ appTabs: ["home", "market"], tabPanels: ["home", "market"] });
  await withUiState(fake.document, async ({ setActiveAppTab }) => {
    assert.equal(setActiveAppTab("home"), "home");
    fake.events.length = 0;
    fake.resetMutations();

    assert.equal(setActiveAppTab("HOME"), "home");
    assert.equal(fake.mutations, 0);
    assert.deepEqual(fake.events, []);
  });
});

test("tab change events emit only when the active tab actually changes", async () => {
  const fake = createFakeDocument({ appTabs: ["home", "market"], tabPanels: ["home", "market"] });
  await withUiState(fake.document, async ({ setActiveAppTab }) => {
    setActiveAppTab("home");
    setActiveAppTab("home");
    setActiveAppTab("market");

    assert.deepEqual(fake.events.map((event) => [event.type, event.detail.tab]), [
      ["stock-survival:tab-change", "home"],
      ["stock-survival:tab-change", "market"],
    ]);
  });
});

test("sheet helpers return false when the requested id is missing", async () => {
  const fake = createFakeDocument();
  await withUiState(fake.document, async ({ openSheet, closeSheet }) => {
    assert.equal(openSheet("missing-modal"), false);
    assert.equal(closeSheet("missing-modal"), false);
  });
});

test("opening a modal locks body scrolling", async () => {
  const fake = createFakeDocument({ sheets: [{ id: "profile-modal" }] });
  await withUiState(fake.document, async ({ openSheet }) => {
    fake.triggers[0].focus();
    assert.equal(openSheet("profile-modal"), true);
    const sheet = fake.getElementById("profile-modal");
    assert.equal(sheet.classList.contains("is-hidden"), false);
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    assert.equal(sheet.getAttribute("aria-hidden"), "false");
    assert.equal(fake.document.activeElement, sheet.focusables[0]);
    assert.equal(fake.triggers[0].getAttribute("aria-expanded"), "true");
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), true);
  });
});

test("nested sheets trap focus and restore the exact focused trigger in stack order", async () => {
  const fake = createFakeDocument({
    sheets: [{ id: "profile-modal" }, { id: "message-modal" }],
  });
  await withUiState(fake.document, async ({ openSheet, closeSheet }) => {
    const profile = fake.getElementById("profile-modal");
    const message = fake.getElementById("message-modal");
    fake.outside.focus();
    openSheet("profile-modal");
    profile.focusables[1].focus();
    const nestedTrigger = profile.focusables[1];
    openSheet("message-modal");

    message.focusables[1].focus();
    const forward = fake.dispatch("keydown", { key: "Tab" });
    assert.equal(forward.defaultPrevented, true);
    assert.equal(fake.document.activeElement, message.focusables[0]);

    const backward = fake.dispatch("keydown", { key: "Tab", shiftKey: true });
    assert.equal(backward.defaultPrevented, true);
    assert.equal(fake.document.activeElement, message.focusables[1]);

    closeSheet("message-modal");
    assert.equal(fake.document.activeElement, nestedTrigger);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), true);
    closeSheet("profile-modal");
    assert.equal(fake.document.activeElement, fake.outside);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), false);
  });
});

test("Escape closes only the top sheet and restores focus to its opener", async () => {
  const fake = createFakeDocument({
    sheets: [{ id: "profile-modal" }, { id: "message-modal" }],
  });
  await withUiState(fake.document, async ({ openSheet }) => {
    const profile = fake.getElementById("profile-modal");
    const message = fake.getElementById("message-modal");
    fake.outside.focus();
    openSheet("profile-modal");
    profile.focusables[1].focus();
    openSheet("message-modal");

    const event = fake.dispatch("keydown", { key: "Escape" });
    assert.equal(event.defaultPrevented, true);
    assert.equal(message.classList.contains("is-hidden"), true);
    assert.equal(profile.classList.contains("is-hidden"), false);
    assert.equal(fake.document.activeElement, profile.focusables[1]);
  });
});

test("backdrop and close-control clicks dismiss a sheet while sheet-card clicks do not", async () => {
  const fake = createFakeDocument({ sheets: [{ id: "global-chat-sheet", type: "chat" }] });
  await withUiState(fake.document, async ({ openSheet }) => {
    const sheet = fake.getElementById("global-chat-sheet");
    fake.triggers[0].focus();
    openSheet("global-chat-sheet");

    fake.dispatch("click", { target: sheet.card });
    assert.equal(sheet.classList.contains("is-hidden"), false);

    fake.dispatch("click", { target: sheet });
    assert.equal(sheet.classList.contains("is-hidden"), true);
    assert.equal(fake.document.activeElement, fake.triggers[0]);

    openSheet("global-chat-sheet");
    const closeButton = sheet.focusables[0];
    closeButton.dataset.sheetClose = "";
    fake.dispatch("click", { target: closeButton });
    assert.equal(sheet.classList.contains("is-hidden"), true);
  });
});

test("closing one sheet keeps scrolling locked while global chat remains open", async () => {
  const fake = createFakeDocument({
    sheets: [
      { id: "profile-modal", open: true },
      { id: "global-chat-sheet", open: true, type: "chat" },
    ],
  });
  await withUiState(fake.document, async ({ closeSheet }) => {
    assert.equal(closeSheet("profile-modal"), true);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), true);
  });
});

test("closing the last open sheet unlocks body scrolling", async () => {
  const fake = createFakeDocument({ sheets: [{ id: "profile-modal", open: true }] });
  await withUiState(fake.document, async ({ closeSheet }) => {
    assert.equal(closeSheet("profile-modal"), true);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), false);
  });
});

test("global chat starts hidden and its open-close lifecycle controls body locking", async () => {
  const fake = createFakeDocument({ sheets: [{ id: "global-chat-sheet", type: "chat" }] });
  await withUiState(fake.document, async ({ openSheet, closeSheet }) => {
    const chatSheet = fake.getElementById("global-chat-sheet");
    assert.equal(chatSheet.classList.contains("is-hidden"), true);

    assert.equal(openSheet("global-chat-sheet"), true);
    assert.equal(chatSheet.classList.contains("is-hidden"), false);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), true);

    assert.equal(closeSheet("global-chat-sheet"), true);
    assert.equal(chatSheet.classList.contains("is-hidden"), true);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), false);
  });
});

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
  const mutate = () => { mutations += 1; };
  const createElement = ({ id = "", classes = [], dataset = {} }) => {
    const attributes = new Map();
    let hidden = false;
    return {
      id,
      dataset,
      classList: createClassList(classes, mutate),
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
  };
  const tabs = appTabs.map((tab) => createElement({ dataset: { appTab: tab } }));
  const panels = tabPanels.map((tab) => createElement({ dataset: { tabPanel: tab } }));
  const sheetElements = sheets.map(({ id, open = false, type = "modal" }) => createElement({
    id,
    classes: [type === "chat" ? "global-chat-sheet" : "modal-backdrop", ...(open ? [] : ["is-hidden"])],
  }));
  const elementsById = new Map(sheetElements.map((element) => [element.id, element]));
  const body = createElement({});
  const document = {
    body,
    querySelectorAll(selector) {
      if (selector === "[data-app-tab]") return tabs;
      if (selector === "[data-tab-panel]") return panels;
      if (selector === ".modal-backdrop, .global-chat-sheet") return sheetElements;
      return [];
    },
    getElementById(id) {
      return elementsById.get(id) ?? null;
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
  return {
    document,
    events,
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
    assert.equal(openSheet("profile-modal"), true);
    assert.equal(fake.getElementById("profile-modal").classList.contains("is-hidden"), false);
    assert.equal(fake.document.body.classList.contains("has-open-sheet"), true);
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

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function loadOnboardingState() {
  const source = await readFile(`${root}/onboarding-state.js`, "utf8").catch(() => "");
  assert.match(source, /export const ONBOARDING_KEY/);
  assert.match(source, /export function hasSeenOnboarding/);
  assert.match(source, /export function markOnboardingSeen/);
  return import(`../onboarding-state.js?test=${Date.now()}-${Math.random()}`);
}

test("onboarding storage helpers read and write the shared key", async () => {
  const { ONBOARDING_KEY, hasSeenOnboarding, markOnboardingSeen } = await loadOnboardingState();
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(ONBOARDING_KEY, "stock-survival-onboarding-seen");
  assert.equal(hasSeenOnboarding(storage), false);
  assert.equal(markOnboardingSeen(storage), true);
  assert.equal(values.get(ONBOARDING_KEY), "1");
  assert.equal(hasSeenOnboarding(storage), true);
});

test("onboarding storage helpers contain access, get and set failures", async () => {
  const { hasSeenOnboarding, markOnboardingSeen } = await loadOnboardingState();
  const deniedReadAccess = Object.defineProperty({}, "getItem", {
    get() { throw new Error("read access denied"); },
  });
  const deniedWriteAccess = Object.defineProperty({}, "setItem", {
    get() { throw new Error("write access denied"); },
  });
  const throwingStorage = {
    getItem() { throw new Error("read denied"); },
    setItem() { throw new Error("write denied"); },
  };

  assert.doesNotThrow(() => hasSeenOnboarding(deniedReadAccess));
  assert.equal(hasSeenOnboarding(deniedReadAccess), false);
  assert.doesNotThrow(() => hasSeenOnboarding(throwingStorage));
  assert.equal(hasSeenOnboarding(throwingStorage), false);
  assert.doesNotThrow(() => markOnboardingSeen(deniedWriteAccess));
  assert.equal(markOnboardingSeen(deniedWriteAccess), false);
  assert.doesNotThrow(() => markOnboardingSeen(throwingStorage));
  assert.equal(markOnboardingSeen(throwingStorage), false);

  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("global storage access denied"); },
  });
  try {
    assert.doesNotThrow(() => hasSeenOnboarding());
    assert.equal(hasSeenOnboarding(), false);
    assert.doesNotThrow(() => markOnboardingSeen());
    assert.equal(markOnboardingSeen(), false);
  } finally {
    if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    else delete globalThis.localStorage;
  }
});

test("onboarding storage helpers safely handle missing storage", async () => {
  const { hasSeenOnboarding, markOnboardingSeen } = await loadOnboardingState();
  assert.equal(hasSeenOnboarding(null), false);
  assert.equal(markOnboardingSeen(null), false);
});

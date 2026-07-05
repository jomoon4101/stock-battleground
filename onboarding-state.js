export const ONBOARDING_KEY = "stock-survival-onboarding-seen";

function resolveStorage(storage, argumentCount) {
  return argumentCount > 0 ? storage : globalThis.localStorage;
}

export function hasSeenOnboarding(storage) {
  try {
    const target = resolveStorage(storage, arguments.length);
    if (!target || typeof target.getItem !== "function") return false;
    return target.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(storage) {
  try {
    const target = resolveStorage(storage, arguments.length);
    if (!target || typeof target.setItem !== "function") return false;
    target.setItem(ONBOARDING_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

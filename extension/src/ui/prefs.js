/** UI preferences in chrome.storage.local (theme, density, filters, onboarding). */

export async function loadPrefs(keys) {
  return chrome.storage.local.get(keys);
}

/** Persist one preference; failures go to onError instead of becoming unhandled rejections. */
export function savePref(key, value, { onError } = {}) {
  return chrome.storage.local.set({ [key]: value }).catch((e) => onError?.(e));
}

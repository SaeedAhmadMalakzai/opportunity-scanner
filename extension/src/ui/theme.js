/** Light/dark theme shared by the popup and options pages. */
import { PREF_KEYS } from "../lib/types.js";
import { loadPrefs, savePref } from "./prefs.js";

const DARK = "dark";
const LIGHT = "light";

function systemTheme() {
  return matchMedia("(prefers-color-scheme: dark)").matches ? DARK : LIGHT;
}

/** Apply the stored theme, falling back to the OS preference. */
export async function initTheme() {
  const prefs = await loadPrefs([PREF_KEYS.THEME]);
  document.documentElement.dataset.theme = prefs[PREF_KEYS.THEME] || systemTheme();
}

export function bindThemeToggle(button, { onError } = {}) {
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === DARK ? LIGHT : DARK;
    document.documentElement.dataset.theme = next;
    savePref(PREF_KEYS.THEME, next, { onError });
  });
}

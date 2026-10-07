/** The popup's single status banner (errors, offline notice, scan summaries with an action). */

const TONE_CLASS = Object.freeze({ danger: "is-danger", ok: "is-ok", info: "" });

const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const bannerAction = document.getElementById("bannerAction");
let hideTimer = null;

/**
 * @param {string} text
 * @param {{ tone?: "danger"|"ok"|"info", actionLabel?: string, onAction?: () => void, timeout?: number }} [options]
 */
export function showBanner(text, { tone = "info", actionLabel, onAction, timeout } = {}) {
  clearTimeout(hideTimer);
  bannerText.textContent = text;
  banner.className = `banner ${TONE_CLASS[tone] ?? ""}`.trim();
  bannerAction.hidden = !onAction;
  bannerAction.textContent = actionLabel || "";
  bannerAction.onclick = onAction || null;
  banner.hidden = false;
  if (timeout) hideTimer = setTimeout(hideBanner, timeout);
}

export function hideBanner() {
  clearTimeout(hideTimer);
  banner.hidden = true;
}

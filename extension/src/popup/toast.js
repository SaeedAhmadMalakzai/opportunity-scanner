const DEFAULT_TOAST_MS = 6000;

const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
const toastAction = document.getElementById("toastAction");
let hideTimer = null;
let current = { action: null, onError: null };

toastAction.addEventListener("click", async () => {
  const { action, onError } = current;
  hideToast();
  if (!action) return;
  try {
    await action();
  } catch (e) {
    onError?.(e);
  }
});

/**
 * @param {string} text
 * @param {{ actionLabel?: string, onAction?: () => Promise<void>|void, onError?: (e: Error) => void, duration?: number }} [options]
 *   onError receives any failure of onAction (e.g. a failed undo).
 */
export function showToast(text, { actionLabel, onAction, onError, duration = DEFAULT_TOAST_MS } = {}) {
  clearTimeout(hideTimer);
  toastText.textContent = text;
  current = { action: onAction || null, onError: onError || null };
  toastAction.hidden = !onAction;
  toastAction.textContent = actionLabel || "Undo";
  toast.hidden = false;
  hideTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  clearTimeout(hideTimer);
  toast.hidden = true;
  current = { action: null, onError: null };
}

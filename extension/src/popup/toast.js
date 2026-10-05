const toast = document.getElementById("toast");
const toastText = document.getElementById("toastText");
const toastAction = document.getElementById("toastAction");
let hideTimer = null;
let currentAction = null;

toastAction.addEventListener("click", async () => {
  const fn = currentAction;
  hideToast();
  if (fn) await fn();
});

export function showToast(text, { actionLabel, onAction, duration = 6000 } = {}) {
  clearTimeout(hideTimer);
  toastText.textContent = text;
  currentAction = onAction || null;
  toastAction.hidden = !onAction;
  toastAction.textContent = actionLabel || "Undo";
  toast.hidden = false;
  hideTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  clearTimeout(hideTimer);
  toast.hidden = true;
  currentAction = null;
}

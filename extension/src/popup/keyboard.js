/** Popup keyboard shortcuts. Pure key classification is exported for tests; bindKeyboard wires the DOM. */

const KEY_ACTIONS = Object.freeze({
  "/": "focusSearch",
  j: "next", ArrowDown: "next",
  k: "prev", ArrowUp: "prev",
  s: "save",
  d: "dismiss",
  o: "open", Enter: "open",
  x: "select",
  r: "scan",
  e: "export"
});

/** Actions whose key would otherwise scroll the page or type into the search box. */
const PREVENT_DEFAULT = new Set(["focusSearch", "next", "prev"]);

export function isTextEntry(target) {
  return /^(input|select|textarea)$/i.test(target?.tagName || "") || Boolean(target?.isContentEditable);
}

export function isActivatable(target) {
  return Boolean(target?.closest?.("button, a, [role=tab]"));
}

/** Map a keydown event to an action name, or null when the key should be left alone. */
export function keyAction(e) {
  if (e.key === "Escape") return "escape";
  if (isTextEntry(e.target) || e.metaKey || e.ctrlKey || e.altKey) return null;
  // Enter on a button/link/tab activates that control; it must not also open the focused notice.
  if (e.key === "Enter" && isActivatable(e.target)) return null;
  return Object.hasOwn(KEY_ACTIONS, e.key) ? KEY_ACTIONS[e.key] : null;
}

function handleEscape(e, { els, getState, actions }) {
  if (isTextEntry(e.target)) {
    e.target.blur();
    if (e.target === els.search && els.search.value) actions.clearSearch();
  } else if (getState().selectedIds.size) {
    actions.clearSelection();
  } else {
    actions.hideToast();
  }
}

/**
 * @param {{ els: object, getState: () => object, actions: Record<string, () => unknown> }} deps
 *   actions: focusSearch, next, prev, save, dismiss, open, select, scan, export, clearSearch, clearSelection, hideToast
 */
export function bindKeyboard(deps) {
  document.addEventListener("keydown", (e) => {
    const action = keyAction(e);
    if (!action) return;
    if (action === "escape") { handleEscape(e, deps); return; }
    if (PREVENT_DEFAULT.has(action)) e.preventDefault();
    deps.actions[action]?.();
  });
}

/** Popup rendering that depends on the current state: counts, result list, selection, focus. */
import { renderList, buildEmptyState } from "./render.js";
import { hideToast } from "./toast.js";
import { relativeTime, plural } from "../ui/format.js";
import { hasActiveFilters, pickEmptyState } from "./state.js";
import { EMPTY_STATES } from "./empty-states.js";

let deps = null;
let els = null;

/**
 * Wire the module to the popup's state; call once before any other export.
 * @param {{ els: object, getState: () => object, setState: (patch: object) => void,
 *   emptyActions: { scan: () => void, resetFilters: () => void } }} d
 */
export function initView(d) {
  deps = d;
  els = d.els;
}

const getState = () => deps.getState();
const setState = (patch) => deps.setState(patch);

const cards = () => els.results.querySelectorAll(".card");
export const cardById = (id) => els.results.querySelector(`.card[data-id="${CSS.escape(id)}"]`);

export function renderCounts() {
  const { counts: c, scanState: st, health } = getState();
  const set = (k, v) => { const el = els.statusSeg.querySelector(`[data-count="${k}"]`); if (el) el.textContent = String(v); };
  set("active", c.total - c.dismissed); set("new", c.new); set("saved", c.saved); set("dismissed", c.dismissed);
  const when = st?.lastScanAt ? ` · scanned ${relativeTime(st.lastScanAt)}` : "";
  els.brandSub.textContent = `Afghanistan · ${plural(Object.keys(health).length, "source")} · ${plural(c.total, "notice")}${when}`;
  const errors = Object.values(health).filter((h) => h.status === "error").length;
  els.healthLink.textContent = errors ? `Sources · ${errors} failing` : "Sources";
  els.healthLink.classList.toggle("has-errors", errors > 0);
}

export function renderScanMeta() {
  const st = getState().scanState;
  if (!st) return;
  const failed = Boolean(st.lastError && !st.isRunning);
  els.lastScan.classList.toggle("is-error", failed);
  if (failed) { els.lastScan.textContent = "Last scan failed"; els.lastScan.title = st.lastError; return; }
  els.lastScan.textContent = st.lastScanAt ? `Scanned ${relativeTime(st.lastScanAt)} · ${st.lastAddedCount || 0} new` : "";
  els.lastScan.title = st.lastScanAt ? new Date(st.lastScanAt).toLocaleString() : "";
}

function updateBulkBar() {
  const { selectedIds, items } = getState();
  const n = selectedIds.size;
  els.bulkBar.hidden = n === 0;
  els.bulkCount.textContent = `${n} selected`;
  els.selectAll.checked = n > 0 && n === items.length;
  els.selectAll.indeterminate = n > 0 && n < items.length;
  if (n) hideToast();
}

function emptyState() {
  const { hasEverScanned, params } = getState();
  const config = EMPTY_STATES[pickEmptyState({ hasEverScanned, filtersActive: hasActiveFilters(params) })];
  const action = { label: config.actionLabel, primary: config.action === "scan", onClick: deps.emptyActions[config.action] };
  return buildEmptyState({ title: config.title, hint: config.hint, actions: [action] });
}

export function renderResults() {
  const { items, selectedIds, focusedId } = getState();
  els.resultCount.textContent = plural(items.length, "result");
  if (items.length) renderList(els.results, items, { selectedIds, focusedId });
  else els.results.replaceChildren(emptyState());
  updateBulkBar();
}

/** Replace the selection and sync every card checkbox plus the bulk bar. */
export function setSelection(next) {
  setState({ selectedIds: next });
  for (const card of cards()) {
    const on = next.has(card.dataset.id);
    card.querySelector(".card-check").checked = on;
    card.classList.toggle("is-selected", on);
  }
  updateBulkBar();
}

export function setFocused(id, { scroll = true } = {}) {
  setState({ focusedId: id });
  for (const card of cards()) {
    const on = card.dataset.id === id;
    card.classList.toggle("is-focused", on);
    if (on && scroll) card.scrollIntoView({ block: "nearest" });
  }
}

export function moveFocus(delta) {
  const { items, focusedId } = getState();
  if (!items.length) return;
  const idx = items.findIndex((i) => i.id === focusedId);
  const fallback = delta > 0 ? 0 : items.length - 1;
  const next = idx === -1 ? fallback : Math.max(0, Math.min(items.length - 1, idx + delta));
  setFocused(items[next].id);
}

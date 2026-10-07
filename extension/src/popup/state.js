/** Pure popup state helpers: every function returns new values and never mutates its inputs. */
import { ITEM_STATUS } from "../lib/types.js";

const ALL = "all";

export const DEFAULT_PARAMS = Object.freeze({
  statusFilter: ALL, typeFilter: ALL, sortBy: "score", minScore: 0,
  keywordFilter: ALL, sourceFilter: ALL, searchQuery: "", showClosed: false
});

/** Clicking Save on a saved item (or Dismiss on a dismissed one) moves it back to New. */
export function nextStatus(current, target) {
  return current === target ? ITEM_STATUS.NEW : target;
}

function replaceItem(items, id, patch) {
  return items.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

export function withItemStatus(items, id, status) {
  return replaceItem(items, id, { status });
}

export function withItemNote(items, id, notes) {
  return replaceItem(items, id, { notes });
}

export function withoutItem(items, id) {
  return items.filter((it) => it.id !== id);
}

export function adjustCounts(counts, from, to) {
  if (from === to) return { ...counts };
  const next = { ...counts };
  if (from in next) next[from] -= 1;
  if (to in next) next[to] += 1;
  return next;
}

/** Whether an item with `status` disappears from the tab selected by `statusFilter`. */
export function leavesView(statusFilter, status) {
  return statusFilter === ALL ? status === ITEM_STATUS.DISMISSED : status !== statusFilter;
}

export function hasActiveFilters(params) {
  return params.typeFilter !== ALL || params.minScore > 0 || params.keywordFilter !== ALL
    || params.sourceFilter !== ALL || Boolean(params.searchQuery) || params.statusFilter !== ALL
    || Boolean(params.showClosed);
}

/** @returns {"never"|"noMatches"|"inboxZero"} */
export function pickEmptyState({ hasEverScanned, filtersActive }) {
  if (!hasEverScanned) return "never";
  return filtersActive ? "noMatches" : "inboxZero";
}

/**
 * Derive the next popup state from a GET_DASHBOARD response: selection is limited to visible ids and
 * focus is kept only when requested and still visible.
 */
export function applyDashboard(state, data, { keepFocus = true } = {}) {
  const items = data.items || [];
  const visible = new Set(items.map((i) => i.id));
  return {
    items,
    counts: data.counts,
    facets: data.facets,
    health: data.health || {},
    scanState: data.state,
    hasEverScanned: Boolean(data.state?.lastScanAt) || data.counts.total > 0,
    selectedIds: new Set([...state.selectedIds].filter((id) => visible.has(id))),
    focusedId: keepFocus && visible.has(state.focusedId) ? state.focusedId : null
  };
}

/** Restore persisted filters, keeping only known keys whose value has the default's type. */
export function sanitizeFilters(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const entries = Object.entries(DEFAULT_PARAMS).map(([key, fallback]) => {
    const value = source[key];
    return [key, typeof value === typeof fallback ? value : fallback];
  });
  return Object.fromEntries(entries);
}

/** Keep an active facet filter selectable even when no stored item matches it any more. */
export function withCurrentOption(options, current) {
  if (current === ALL || options.some((o) => o.value === current)) return options;
  return [...options, { value: current, count: 0 }];
}

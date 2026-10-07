import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PARAMS, nextStatus, withItemStatus, withItemNote, withoutItem, adjustCounts, leavesView,
  hasActiveFilters, pickEmptyState, applyDashboard, sanitizeFilters, withCurrentOption
} from "../extension/src/popup/state.js";

const items = Object.freeze([
  Object.freeze({ id: "a", title: "A", status: "new", notes: "" }),
  Object.freeze({ id: "b", title: "B", status: "saved", notes: "x" })
]);

test("withItemStatus / withItemNote / withoutItem return new arrays and never mutate", () => {
  const dismissed = withItemStatus(items, "a", "dismissed");
  assert.notEqual(dismissed, items);
  assert.equal(dismissed[0].status, "dismissed");
  assert.equal(items[0].status, "new");
  assert.equal(dismissed[1], items[1], "untouched items are shared");
  assert.equal(withItemNote(items, "b", "call")[1].notes, "call");
  assert.deepEqual(withoutItem(items, "a").map((i) => i.id), ["b"]);
  assert.equal(items.length, 2);
  assert.deepEqual(withItemStatus(items, "zzz", "saved"), [...items], "unknown id leaves the list unchanged");
});

test("adjustCounts moves one item between buckets without mutating", () => {
  const counts = Object.freeze({ total: 3, new: 2, saved: 1, dismissed: 0 });
  assert.deepEqual(adjustCounts(counts, "new", "dismissed"), { total: 3, new: 1, saved: 1, dismissed: 1 });
  assert.deepEqual(adjustCounts(counts, "saved", "saved"), counts);
  assert.deepEqual(adjustCounts(counts, "weird", "new"), { total: 3, new: 3, saved: 1, dismissed: 0 });
});

test("nextStatus toggles back to new when the target is already set", () => {
  assert.equal(nextStatus("saved", "saved"), "new");
  assert.equal(nextStatus("new", "saved"), "saved");
  assert.equal(nextStatus("dismissed", "dismissed"), "new");
  assert.equal(nextStatus("saved", "dismissed"), "dismissed");
});

test("leavesView: dismissed leaves the Active tab; any change leaves a specific tab", () => {
  assert.equal(leavesView("all", "dismissed"), true);
  assert.equal(leavesView("all", "saved"), false);
  assert.equal(leavesView("saved", "new"), true);
  assert.equal(leavesView("dismissed", "dismissed"), false);
});

test("applyDashboard drops invisible selections, resets focus per keepFocus, returns a new Set", () => {
  const state = { selectedIds: new Set(["a", "gone"]), focusedId: "a" };
  const data = { items: [items[0]], counts: { total: 1, new: 1, saved: 0, dismissed: 0 }, facets: { keywords: [], sources: [] }, health: null, state: { lastScanAt: null } };
  const kept = applyDashboard(state, data);
  assert.deepEqual([...kept.selectedIds], ["a"]);
  assert.notEqual(kept.selectedIds, state.selectedIds);
  assert.equal(state.selectedIds.size, 2, "input set not mutated");
  assert.equal(kept.focusedId, "a");
  assert.deepEqual(kept.health, {});
  assert.equal(kept.hasEverScanned, true, "stored items count as scanned");
  assert.equal(applyDashboard(state, data, { keepFocus: false }).focusedId, null);
  const gone = applyDashboard({ selectedIds: new Set(), focusedId: "b" }, { ...data, counts: { total: 0, new: 0, saved: 0, dismissed: 0 } });
  assert.equal(gone.focusedId, null, "focus on an invisible item is dropped");
  assert.equal(gone.hasEverScanned, false);
});

test("hasActiveFilters is false for DEFAULT_PARAMS and true for any deviation", () => {
  assert.equal(hasActiveFilters(DEFAULT_PARAMS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_PARAMS, sortBy: "deadline" }), false, "sort is not a filter");
  for (const patch of [{ searchQuery: "x" }, { minScore: 5 }, { statusFilter: "saved" }, { keywordFilter: "pmp" }, { sourceFilter: "a.org" }, { typeFilter: "tender" }, { showClosed: true }]) {
    assert.equal(hasActiveFilters({ ...DEFAULT_PARAMS, ...patch }), true, JSON.stringify(patch));
  }
  assert.ok(Object.isFrozen(DEFAULT_PARAMS));
});

test("pickEmptyState covers never / noMatches / inboxZero", () => {
  assert.equal(pickEmptyState({ hasEverScanned: false, filtersActive: true }), "never");
  assert.equal(pickEmptyState({ hasEverScanned: true, filtersActive: true }), "noMatches");
  assert.equal(pickEmptyState({ hasEverScanned: true, filtersActive: false }), "inboxZero");
});

test("A1 regression: dismissing the only visible item empties the list and shows inbox zero", () => {
  const only = [{ id: "a", title: "A", status: "new" }];
  const afterDismiss = withoutItem(withItemStatus(only, "a", "dismissed"), "a");
  assert.deepEqual(afterDismiss, []);
  assert.equal(pickEmptyState({ hasEverScanned: true, filtersActive: hasActiveFilters(DEFAULT_PARAMS) }), "inboxZero");
});

test("sanitizeFilters whitelists stored filter keys and value types", () => {
  const out = sanitizeFilters({ statusFilter: "saved", minScore: 40, evil: "x", showClosed: "yes", searchQuery: 5 });
  assert.equal(out.statusFilter, "saved");
  assert.equal(out.minScore, 40);
  assert.equal(out.showClosed, DEFAULT_PARAMS.showClosed, "wrong type falls back to default");
  assert.equal(out.searchQuery, DEFAULT_PARAMS.searchQuery);
  assert.ok(!("evil" in out));
  assert.deepEqual(sanitizeFilters(null), { ...DEFAULT_PARAMS });
});

test("A5: withCurrentOption keeps an active facet filter visible with a zero count", () => {
  const options = [{ value: "pmp", count: 3 }];
  assert.deepEqual(withCurrentOption(options, "all"), options);
  assert.deepEqual(withCurrentOption(options, "pmp"), options);
  assert.deepEqual(withCurrentOption(options, "gone"), [...options, { value: "gone", count: 0 }]);
  assert.equal(options.length, 1, "input not mutated");
});

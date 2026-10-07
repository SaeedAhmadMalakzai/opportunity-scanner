import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.js";

installChromeMock();
const storage = await import("../extension/src/lib/storage.js");
const { SETTINGS_VERSION, DEFAULT_SETTINGS } = await import("../extension/src/lib/types.js");

beforeEach(async () => {
  await chrome.storage.local.remove(Object.values(storage.KEYS));
  storage.invalidateCache();
});

test("migrateSettings drops retired sources, adds new defaults, keeps user choices", () => {
  const { settings, changed } = storage.migrateSettings({ settingsVersion: 12, enabledSources: ["acbar-rfp", "unjobs-af", "wfp-procurement"], minScore: 40 });
  assert.equal(changed, true);
  assert.equal(settings.minScore, 40);
  assert.ok(!settings.enabledSources.includes("unjobs-af"));
  assert.ok(settings.enabledSources.includes("acbar-rfp"));
  assert.ok(settings.enabledSources.includes("ungm-afghanistan"), "new default source enabled on upgrade");
  assert.equal(settings.settingsVersion, SETTINGS_VERSION);
});

test("migrateSettings keeps a current-version user's disabled sources disabled", () => {
  const stored = { ...DEFAULT_SETTINGS, enabledSources: ["acbar-rfp"] };
  const { settings, changed } = storage.migrateSettings(stored);
  assert.deepEqual(settings.enabledSources, ["acbar-rfp"]);
  assert.equal(changed, false);
});

test("getSettings survives a corrupted enabledSources value", async () => {
  await chrome.storage.local.set({ [storage.KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, enabledSources: "acbar-rfp" } });
  const s = await storage.getSettings();
  assert.deepEqual(s.enabledSources, DEFAULT_SETTINGS.enabledSources);
});

test("getSettings persists the migrated settings once", async () => {
  await chrome.storage.local.set({ [storage.KEYS.SETTINGS]: { settingsVersion: 1, enabledSources: ["tendersontime-af"] } });
  const s = await storage.getSettings();
  assert.ok(!s.enabledSources.includes("tendersontime-af"));
  const raw = await chrome.storage.local.get(storage.KEYS.SETTINGS);
  assert.equal(raw[storage.KEYS.SETTINGS].settingsVersion, SETTINGS_VERSION);
});

test("upsert keeps status/notes/firstSeenAt of existing items and caches reads", async () => {
  await storage.upsertOpportunities([{ id: "a", title: "A", score: 10 }]);
  await storage.setItemStatus("a", "saved");
  await storage.updateOpportunityNote("a", "note");
  await storage.upsertOpportunities([{ id: "a", title: "A2", score: 20 }, { id: "b", title: "B" }]);
  const map = await storage.getOpportunitiesMap();
  assert.equal(map.a.status, "saved");
  assert.equal(map.a.notes, "note");
  assert.equal(map.a.title, "A2");
  assert.equal(map.b.status, "new");
  assert.ok(map.a.firstSeenAt <= map.b.firstSeenAt);
});

test("setItemStatus returns the previous status and validates input", async () => {
  await storage.upsertOpportunities([{ id: "a", title: "A" }]);
  assert.equal(await storage.setItemStatus("a", "dismissed"), "new");
  assert.equal(await storage.setItemStatus("missing", "saved"), null);
  await assert.rejects(storage.setItemStatus("a", "bogus"), /Invalid status/);
});

test("isValidStatus accepts only the three item statuses; restoreStatuses skips invalid ones", async () => {
  assert.equal(storage.isValidStatus("saved"), true);
  assert.equal(storage.isValidStatus("archived"), false);
  assert.equal(storage.isValidStatus(undefined), false);
  await storage.upsertOpportunities([{ id: "a", title: "A" }]);
  await storage.restoreStatuses({ a: "archived", ghost: "saved" });
  assert.equal((await storage.getOpportunitiesMap()).a.status, "new");
});

test("bulkUpdateStatus and restoreStatuses round-trip (undo)", async () => {
  await storage.upsertOpportunities([{ id: "a", title: "A" }, { id: "b", title: "B" }]);
  await storage.setItemStatus("b", "saved");
  const previous = await storage.bulkUpdateStatus(["a", "b", "zzz"], "dismissed");
  assert.deepEqual(previous, { a: "new", b: "saved" });
  await storage.restoreStatuses(previous);
  const map = await storage.getOpportunitiesMap();
  assert.equal(map.a.status, "new");
  assert.equal(map.b.status, "saved");
});

test("pruneOpportunityMap drops dismissed, then oldest new, never saved first", () => {
  const map = {};
  for (let i = 0; i < 10; i++) map[`d${i}`] = { status: "dismissed", lastUpdatedAt: `2026-01-0${i % 9 + 1}` };
  for (let i = 0; i < 10; i++) map[`n${i}`] = { status: "new", lastUpdatedAt: `2026-02-0${i % 9 + 1}` };
  for (let i = 0; i < 5; i++) map[`s${i}`] = { status: "saved", lastUpdatedAt: "2025-01-01" };
  const pruned = storage.pruneOpportunityMap(map, 12);
  const keys = Object.keys(pruned);
  assert.equal(keys.length, 12);
  assert.ok(keys.filter((k) => k.startsWith("s")).length === 5);
  assert.ok(keys.every((k) => !k.startsWith("d")));
});

test("mergeSeenUrls expires old entries and adds new ones", () => {
  const now = 10_000_000_000;
  const merged = storage.mergeSeenUrls({ old: 1, fresh: now - 1000 }, ["new"], now, 5000);
  assert.deepEqual(Object.keys(merged).sort(), ["fresh", "new"]);
});

test("scan state defaults and patching", async () => {
  const st = await storage.getScanState();
  assert.equal(st.isRunning, false);
  await storage.setScanState({ isRunning: true });
  assert.equal((await storage.getScanState()).isRunning, true);
});

test("clearAllData removes everything but settings", async () => {
  await storage.saveSettings({ minScore: 33 });
  await storage.upsertOpportunities([{ id: "a", title: "A" }]);
  await storage.clearAllData();
  assert.deepEqual(await storage.getOpportunitiesMap(), {});
  assert.equal((await storage.getSettings()).minScore, 33);
});

test("prototype-named ids are not treated as existing records", async () => {
  await storage.upsertOpportunities([{ id: "a", title: "A" }]);
  assert.equal(await storage.setItemStatus("__proto__", "saved"), null);
  assert.equal(await storage.setItemStatus("constructor", "saved"), null);
  await storage.updateOpportunityNote("__proto__", "x");
  const previous = await storage.bulkUpdateStatus(["__proto__", "a"], "dismissed");
  assert.deepEqual(previous, { a: "new" });
  await storage.restoreStatuses({ __proto__: "saved", a: "new" });
  const map = await storage.getOpportunitiesMap();
  assert.deepEqual(Object.keys(map), ["a"]);
  assert.equal(map.a.status, "new");
});

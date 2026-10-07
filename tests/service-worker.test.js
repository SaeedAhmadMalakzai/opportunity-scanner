import { test } from "node:test";
import assert from "node:assert/strict";
import { installChromeMock, dispatch } from "./helpers/chrome-mock.js";
import { fixture } from "./helpers/fixtures.js";

const mock = installChromeMock();
/** Tests may set this to answer specific URLs; returning undefined falls through to the ACBAR fixtures. */
let fetchOverride = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const overridden = await fetchOverride?.(u, opts);
  if (overridden) return overridden;
  const body = u.includes("acbar.org/en/jobs") ? fixture("acbar_jobs.html") : u.includes("acbar.org") ? fixture("acbar_rfp.html") : "";
  if (!body) return new Response("nope", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
};
await import("../extension/src/background/service-worker.js");
const { MSG, DEFAULT_SETTINGS } = await import("../extension/src/lib/types.js");
const { KEYS } = await import("../extension/src/lib/storage.js");

async function waitForScan() {
  for (let i = 0; i < 200; i++) {
    const st = (await dispatch(mock.listeners, MSG.GET_SCAN_STATE)).data;
    if (!st.isRunning) return st;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("scan did not finish");
}

test("service worker registers listeners and creates the alarm on install", async () => {
  assert.equal(mock.listeners.onMessage.length, 1);
  await mock.listeners.onInstalled[0]();
  assert.ok(mock.alarms.get("scheduledScan"));
  assert.equal(mock.alarms.get("scheduledScan").periodInMinutes, 720);
});

test("unknown message types and foreign senders are rejected", async () => {
  const res = await dispatch(mock.listeners, "NOPE");
  assert.equal(res.ok, false);
  const handled = mock.listeners.onMessage[0]({ type: MSG.GET_SCAN_STATE }, { id: "someone-else" }, () => { throw new Error("should not respond"); });
  assert.equal(handled, false);
});

test("START_SCAN runs enabled ACBAR connectors end to end and the dashboard reflects results", async () => {
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { settingsVersion: 13, enabledSources: ["acbar-rfp", "acbar-jobs"], notificationsEnabled: true, highPriorityThreshold: 10 } });
  const start = await dispatch(mock.listeners, MSG.START_SCAN);
  assert.equal(start.ok, true);
  assert.equal(start.data.started, true);
  const again = await dispatch(mock.listeners, MSG.START_SCAN);
  assert.equal(again.data.started, false, "second start is refused while running");
  const state = await waitForScan();
  assert.equal(state.lastError, null, state.lastLog);
  assert.ok(state.lastAddedCount > 8, state.lastLog);
  assert.equal(state.progress.phase, "complete");
  assert.ok(mock.notifications.length > 0 && mock.notifications.length <= 5);

  const dash = (await dispatch(mock.listeners, MSG.GET_DASHBOARD, { sortBy: "score" })).data;
  assert.equal(dash.counts.total, state.lastAddedCount);
  assert.equal(dash.items.length, dash.counts.total);
  assert.ok(dash.items[0].score >= dash.items.at(-1).score);
  assert.equal(dash.health["acbar-rfp"].status, "ok");
  assert.ok(dash.facets.sources.find((s) => s.value === "acbar.org"));

  const second = await dispatch(mock.listeners, MSG.START_SCAN);
  assert.equal(second.data.started, true);
  const state2 = await waitForScan();
  assert.equal(state2.lastAddedCount, 0, "already-seen urls are not re-added");
  assert.equal(state2.totalScans, 2);
});

test("SET_STATUS / BULK_UPDATE / SAVE_NOTE / EXPORT_CSV", async () => {
  const dash = (await dispatch(mock.listeners, MSG.GET_DASHBOARD)).data;
  const [a, b] = dash.items;
  const set = await dispatch(mock.listeners, MSG.SET_STATUS, { id: a.id, status: "dismissed" });
  assert.equal(set.data.previousStatus, "new");
  const afterDismiss = (await dispatch(mock.listeners, MSG.GET_DASHBOARD)).data;
  assert.ok(!afterDismiss.items.find((i) => i.id === a.id), "dismissed hidden by default");
  const bulk = await dispatch(mock.listeners, MSG.BULK_UPDATE, { ids: [a.id, b.id], status: "saved" });
  assert.deepEqual(bulk.data.previous, { [a.id]: "dismissed", [b.id]: "new" });
  await dispatch(mock.listeners, MSG.BULK_UPDATE, { restore: bulk.data.previous });
  await dispatch(mock.listeners, MSG.SAVE_NOTE, { id: b.id, notes: "follow up" });
  const csv = (await dispatch(mock.listeners, MSG.EXPORT_CSV, { ids: [b.id] })).data;
  assert.equal(csv.split("\r\n").length, 2);
  assert.match(csv, /follow up/);
  const bad = await dispatch(mock.listeners, MSG.SET_STATUS, { id: b.id, status: "weird" });
  assert.equal(bad.ok, false);
});

test("TEST_SOURCE returns health and samples; failures are reported not thrown", async () => {
  const ok = await dispatch(mock.listeners, MSG.TEST_SOURCE, { id: "acbar-rfp" });
  assert.equal(ok.data.health.status, "ok");
  assert.ok(ok.data.sample.length > 0);
  const fail = await dispatch(mock.listeners, MSG.TEST_SOURCE, { id: "afghantenders" });
  assert.equal(fail.data.health.status, "error");
  assert.match(fail.data.health.error, /HTTP 404/);
});

test("CLEAR_DATA empties the dashboard", async () => {
  await dispatch(mock.listeners, MSG.CLEAR_DATA);
  const dash = (await dispatch(mock.listeners, MSG.GET_DASHBOARD)).data;
  assert.equal(dash.counts.total, 0);
});

test("A2: two concurrent START_SCAN messages start exactly one scan", async () => {
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, enabledSources: ["acbar-rfp"] } });
  const results = await Promise.all([dispatch(mock.listeners, MSG.START_SCAN), dispatch(mock.listeners, MSG.START_SCAN)]);
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(results.filter((r) => r.data.started).length, 1, JSON.stringify(results));
  const refused = results.find((r) => !r.data.started);
  assert.match(refused.data.reason, /already running/);
  const state = await waitForScan();
  assert.equal(state.lastError, null, state.lastLog);
});

test("SAVE_SETTINGS validates the patch so GET_SETTINGS keeps working", async () => {
  const saved = await dispatch(mock.listeners, MSG.SAVE_SETTINGS, { enabledSources: "x", fetchTimeoutMs: 1e9, bogus: true });
  assert.equal(saved.ok, true, saved.error);
  const got = await dispatch(mock.listeners, MSG.GET_SETTINGS);
  assert.equal(got.ok, true, got.error);
  assert.deepEqual(got.data.enabledSources, DEFAULT_SETTINGS.enabledSources);
  assert.equal(got.data.fetchTimeoutMs, 60000);
  assert.ok(!("bogus" in got.data));
});

const SCAN_PROGRESS = "SCAN_PROGRESS";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, label) {
  for (let i = 0; i < 300; i++) {
    const st = (await dispatch(mock.listeners, MSG.GET_SCAN_STATE)).data;
    if (predicate(st)) return st;
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function freshSettings(patch) {
  await dispatch(mock.listeners, MSG.CLEAR_DATA);
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, ...patch } });
}

test("STOP_SCAN stops scheduling sources and saves partial results as 'stopped'", async () => {
  await freshSettings({ enabledSources: ["acbar-rfp", "acbar-jobs", "acbar-rfq"], maxConcurrentFetches: 1 });
  fetchOverride = async () => { await sleep(30); }; // slow every source down, then fall through to fixtures
  const sentBefore = mock.sent.length;
  try {
    assert.equal((await dispatch(mock.listeners, MSG.START_SCAN)).data.started, true);
    for (let i = 0; i < 300 && !mock.sent.slice(sentBefore).some((m) => m.type === SCAN_PROGRESS && m.data.done >= 1); i++) await sleep(5);
    const stop = await dispatch(mock.listeners, MSG.STOP_SCAN);
    assert.equal(stop.data.stopping, true);
    const state = await waitFor((st) => !st.isRunning, "stopped scan");
    assert.equal(state.progress.phase, "stopped", state.lastLog);
    assert.ok(state.lastAddedCount > 0, "the finished source's items are kept");
    assert.ok(state.progress.done < 3, `only part of the sources ran (${state.progress.done})`);
    assert.match(state.lastLog, /Stop requested/);
  } finally {
    fetchOverride = null;
  }
});

test("a rejecting notifications API does not fail the scan and is logged", async () => {
  await freshSettings({ enabledSources: ["acbar-rfp"], highPriorityThreshold: 10 });
  const original = chrome.notifications.create;
  chrome.notifications.create = async () => { throw new Error("Notifications disabled"); };
  try {
    await dispatch(mock.listeners, MSG.START_SCAN);
    const state = await waitFor((st) => !st.isRunning && st.totalScans === 1, "scan completion");
    assert.equal(state.progress.phase, "complete");
    assert.equal(state.lastError, null);
    assert.match(state.lastLog, /notification skipped: Notifications disabled/);
  } finally {
    chrome.notifications.create = original;
  }
});

test("responses over the size cap become a source health error", async () => {
  fetchOverride = (url) => (url.includes("afghantenders") ? new Response("x".repeat(3 * 1024 * 1024 + 10), { status: 200 }) : undefined);
  try {
    const res = await dispatch(mock.listeners, MSG.TEST_SOURCE, { id: "afghantenders" });
    assert.equal(res.data.health.status, "error");
    assert.match(res.data.health.error, /larger than 3 MB/);
  } finally {
    fetchOverride = null;
  }
});

test("invalid JSON from an API source is reported with its host", async () => {
  fetchOverride = (url) => (url.includes("search.worldbank.org") ? new Response("<html>maintenance</html>", { status: 200 }) : undefined);
  try {
    const res = await dispatch(mock.listeners, MSG.TEST_SOURCE, { id: "worldbank-projects" });
    assert.equal(res.data.health.status, "error");
    assert.equal(res.data.health.error, "Invalid JSON from search.worldbank.org");
  } finally {
    fetchOverride = null;
  }
});

test("the scheduled alarm starts a scan; other alarms are ignored", async () => {
  await freshSettings({ enabledSources: ["acbar-rfp"] });
  mock.listeners.onAlarm[0]({ name: "something-else" });
  await sleep(20);
  assert.equal((await dispatch(mock.listeners, MSG.GET_SCAN_STATE)).data.totalScans, 0);
  mock.listeners.onAlarm[0]({ name: "scheduledScan" });
  const state = await waitFor((st) => !st.isRunning && st.totalScans === 1, "alarm scan");
  assert.equal(state.progress.phase, "complete", state.lastLog);
});

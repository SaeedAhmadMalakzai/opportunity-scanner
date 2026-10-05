import { test } from "node:test";
import assert from "node:assert/strict";
import { installChromeMock, dispatch } from "./helpers/chrome-mock.js";
import { fixture } from "./helpers/fixtures.js";

const mock = installChromeMock();
globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.includes("acbar.org/en/jobs") ? fixture("acbar_jobs.html") : u.includes("acbar.org") ? fixture("acbar_rfp.html") : "";
  if (!body) return new Response("nope", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
};
await import("../extension/src/background/service-worker.js");
const { MSG } = await import("../extension/src/lib/types.js");
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

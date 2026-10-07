import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProgress, finishMessage } from "../extension/src/popup/progress.js";

const labels = { "acbar-rfp": "ACBAR", ungm: "UNGM" };
const labelFor = (id) => labels[id] || id;

test("describeProgress: connectors phase is determinate once the total is known", () => {
  const p = describeProgress({ phase: "connectors", done: 3, total: 12, items: 40, running: ["acbar-rfp", "ungm"] }, labelFor);
  assert.equal(p.determinate, true);
  assert.equal(p.pct, 25);
  assert.equal(p.text, "Fetching sources 3/12 · 40 fetched");
  assert.deepEqual(p.running, { lead: "Now: ", detail: "ACBAR, UNGM" });
  const starting = describeProgress({ phase: "connectors", done: 0, total: 0 });
  assert.equal(starting.determinate, false);
  assert.equal(starting.pct, null);
  assert.equal(starting.text, "Starting sources…");
});

test("describeProgress: last finished source is summarised when nothing is running", () => {
  const ok = describeProgress({ phase: "connectors", done: 1, total: 2, running: [], lastSource: "ACBAR", lastHealth: { status: "ok", count: 1 } });
  assert.deepEqual(ok.running, { lead: "ACBAR", detail: " · 1 item" });
  const failed = describeProgress({ phase: "connectors", done: 2, total: 2, lastSource: "UNGM", lastHealth: { status: "error", error: "HTTP 500" } });
  assert.deepEqual(failed.running, { lead: "UNGM", detail: " · failed: HTTP 500" });
});

test("describeProgress text for every other phase", () => {
  assert.equal(describeProgress({ phase: "custom-sources", total: 2 }).text, "Crawling your custom source pages…");
  assert.equal(describeProgress({ phase: "manual-links" }).text, "Reading your manual links…");
  assert.equal(describeProgress({ phase: "scoring", items: 12 }).text, "Scoring 12 notices…");
  assert.equal(describeProgress({ phase: "saving" }).text, "Saving results…");
  assert.equal(describeProgress({ phase: "mystery" }).text, "Working…");
  assert.equal(describeProgress({ phase: "scoring" }).determinate, false);
});

test("finishMessage for failed / stopped / zero / N new / N new with failures", () => {
  assert.deepEqual(finishMessage({ phase: "failed", error: "boom" }, null, 0), { kind: "banner", tone: "danger", details: false, text: "Scan failed: boom" });
  assert.equal(finishMessage({ phase: "failed" }, { lastError: "disk" }, 0).text, "Scan failed: disk");
  assert.equal(finishMessage({ phase: "failed" }, null, 0).text, "Scan failed: unknown error");
  assert.deepEqual(finishMessage({ phase: "stopped", items: 1 }, null, 0), { kind: "toast", tone: "ok", details: false, text: "Stopped · 1 new notice saved" });
  assert.equal(finishMessage({ phase: "complete", items: 0 }, null, 0).text, "No new notices since last scan");
  assert.equal(finishMessage({ phase: "complete" }, { lastAddedCount: 4 }, 0).text, "4 new notices found");
  assert.deepEqual(finishMessage({ phase: "complete", items: 4 }, null, 2), { kind: "banner", tone: "info", details: true, text: "4 new notices found · 2 sources failed" });
});

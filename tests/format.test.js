import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime, describeDeadline, scoreTier, fmtElapsed, fmtSeconds, plural, isRtl, formatDate } from "../extension/src/ui/format.js";
import { healthBadgeView } from "../extension/src/options/health-view.js";

const NOW = Date.parse("2026-10-05T10:00:00Z");
const MIN = 60000;

test("relativeTime buckets and invalid input", () => {
  assert.equal(relativeTime(new Date(NOW - 20000).toISOString(), NOW), "just now");
  assert.equal(relativeTime(new Date(NOW - 5 * MIN).toISOString(), NOW), "5m ago");
  assert.equal(relativeTime(new Date(NOW - 3 * 60 * MIN).toISOString(), NOW), "3h ago");
  assert.equal(relativeTime(new Date(NOW - 2 * 24 * 60 * MIN).toISOString(), NOW), "2d ago");
  const old = "2026-07-01T00:00:00Z";
  assert.equal(relativeTime(old, NOW), formatDate(old), "older than 30 days shows the date");
  assert.equal(relativeTime("garbage", NOW), "");
  assert.equal(relativeTime(null, NOW), "");
});

test("describeDeadline: past, today, tomorrow, urgent, soon, later, invalid", () => {
  assert.deepEqual(describeDeadline("2026-10-01", NOW), { text: `Closed ${formatDate("2026-10-01")}`, cls: "is-past" });
  assert.deepEqual(describeDeadline("2026-10-05", NOW), { text: "Due today", cls: "is-urgent" });
  assert.deepEqual(describeDeadline("2026-10-06", NOW), { text: "Due tomorrow", cls: "is-urgent" });
  assert.deepEqual(describeDeadline("2026-10-08", NOW), { text: "Due in 3 days", cls: "is-urgent" });
  assert.deepEqual(describeDeadline("2026-10-12", NOW), { text: "Due in 7 days", cls: "is-soon" });
  assert.deepEqual(describeDeadline("2026-10-20", NOW), { text: `Due ${formatDate("2026-10-20")}`, cls: "" });
  assert.deepEqual(describeDeadline("not a date", NOW), { text: "", cls: "" });
  assert.deepEqual(describeDeadline(null, NOW), { text: "", cls: "" });
});

test("scoreTier boundaries at 30 / 60 / 80", () => {
  assert.equal(scoreTier(29), "gray");
  assert.equal(scoreTier(30), "blue");
  assert.equal(scoreTier(59), "blue");
  assert.equal(scoreTier(60), "green");
  assert.equal(scoreTier(79), "green");
  assert.equal(scoreTier(80), "gold");
});

test("fmtElapsed, fmtSeconds, plural, isRtl, formatDate", () => {
  assert.equal(fmtElapsed(65000), "1:05");
  assert.equal(fmtElapsed(-5), "0:00");
  assert.equal(fmtSeconds(1530), "1.5s");
  assert.equal(fmtSeconds(undefined), "0.0s");
  assert.equal(plural(1, "item"), "1 item");
  assert.equal(plural(0, "item"), "0 items");
  assert.equal(isRtl("اعلان داوطلبی خرید"), true);
  assert.equal(isRtl("Request for proposal"), false);
  assert.equal(formatDate("garbage"), "");
  assert.equal(formatDate(""), "");
});

test("healthBadgeView describes needs-setting, unscanned, ok, empty and failed sources", () => {
  const rw = { id: "reliefweb-jobs", requiresSetting: "reliefwebAppName" };
  assert.equal(healthBadgeView(undefined, rw, { reliefwebAppName: " " }, NOW).cls, "health is-needs");
  assert.deepEqual(healthBadgeView(undefined, { id: "x" }, {}, NOW), { cls: "health", text: "not scanned yet", title: "" });
  const at = new Date(NOW - 5 * MIN).toISOString();
  assert.equal(healthBadgeView({ status: "ok", count: 1, ms: 1530, at }, { id: "x" }, {}, NOW).text, "1 item · 1.5s · 5m ago");
  assert.equal(healthBadgeView({ status: "empty", count: 0, ms: 5, at }, { id: "x" }, {}, NOW).text, "0 items · 5m ago");
  const failed = healthBadgeView({ status: "error", count: 0, ms: 5, at, error: "HTTP 500" }, { id: "x" }, {}, NOW);
  assert.deepEqual([failed.cls, failed.text, failed.title], ["health is-error", "failed · 5m ago", "HTTP 500"]);
});

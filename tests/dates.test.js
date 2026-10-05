import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDate, isExpired, daysUntil, ageInDays } from "../extension/src/lib/dates.js";

test("normalizeDate handles the formats seen on real sources", () => {
  assert.equal(normalizeDate("2026-10-20"), "2026-10-20T00:00:00.000Z");
  assert.equal(normalizeDate("22-Oct-2026 08:00 (GMT 0.00)"), "2026-10-22T00:00:00.000Z");
  assert.equal(normalizeDate("04/03/2025"), "2025-03-04T00:00:00.000Z", "day-first numeric");
  assert.equal(normalizeDate("7 October 2026"), "2026-10-07T00:00:00.000Z");
  assert.equal(normalizeDate("October 7, 2026"), "2026-10-07T00:00:00.000Z");
  assert.equal(normalizeDate("2026-10-07T12:00:00Z"), "2026-10-07T12:00:00.000Z");
  assert.equal(normalizeDate("6/30/2025 12:00:00 AM"), null, "month-first US format with day>12 is rejected rather than misread");
  assert.equal(normalizeDate("12/30/2025"), null);
  assert.equal(normalizeDate("Closing soon"), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate("1999-01-01"), null, "implausible year");
});

test("isExpired keeps the deadline day open and expires the day after", () => {
  const now = Date.parse("2026-10-05T10:00:00Z");
  assert.equal(isExpired("2026-10-05T00:00:00Z", now), false);
  assert.equal(isExpired("2026-10-04T00:00:00Z", now), true);
  assert.equal(isExpired(null, now), false);
  assert.equal(isExpired("garbage", now), false);
});

test("daysUntil and ageInDays", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  assert.equal(daysUntil("2026-10-08T00:00:00Z", now), 3);
  assert.equal(daysUntil(null, now), null);
  assert.equal(ageInDays("2026-10-03T00:00:00Z", now), 2);
});

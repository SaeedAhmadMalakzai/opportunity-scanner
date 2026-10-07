import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSettingsPatch, clamp, resolveConcurrency, resolveTimeoutMs } from "../extension/src/lib/settings.js";
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS } from "../extension/src/lib/types.js";

test("clamp bounds numbers and falls back for non-numeric input", () => {
  assert.equal(clamp(500, { min: 0, max: 100 }, 7), 100);
  assert.equal(clamp(-5, { min: 0, max: 100 }, 7), 0);
  assert.equal(clamp("42", { min: 0, max: 100 }, 7), 42);
  assert.equal(clamp("abc", { min: 0, max: 100 }, 7), 7);
  assert.equal(clamp(undefined, { min: 0, max: 100 }, 7), 7);
  assert.equal(clamp(Infinity, { min: 0, max: 100 }, 7), 7);
});

test("normalizeSettingsPatch clamps every bounded number", () => {
  const out = normalizeSettingsPatch({ minScore: 900, highPriorityThreshold: 1, scanIntervalHours: 0, fetchTimeoutMs: 1e9, maxConcurrentFetches: 99 });
  assert.equal(out.minScore, SETTINGS_BOUNDS.minScore.max);
  assert.equal(out.highPriorityThreshold, SETTINGS_BOUNDS.highPriorityThreshold.min);
  assert.equal(out.scanIntervalHours, SETTINGS_BOUNDS.scanIntervalHours.min);
  assert.equal(out.fetchTimeoutMs, 60000);
  assert.equal(out.maxConcurrentFetches, 8);
});

test("normalizeSettingsPatch: non-numeric numbers become defaults", () => {
  const out = normalizeSettingsPatch({ minScore: "lots", scanIntervalHours: null, maxConcurrentFetches: {} });
  assert.equal(out.minScore, DEFAULT_SETTINGS.minScore);
  assert.equal(out.scanIntervalHours, DEFAULT_SETTINGS.scanIntervalHours);
  assert.equal(out.maxConcurrentFetches, DEFAULT_SETTINGS.maxConcurrentFetches);
});

test("normalizeSettingsPatch: enabledSources must be an array of known ids", () => {
  assert.deepEqual(normalizeSettingsPatch({ enabledSources: "acbar-rfp" }).enabledSources, DEFAULT_SETTINGS.enabledSources);
  assert.deepEqual(normalizeSettingsPatch({ enabledSources: ["acbar-rfp", "ghost", "acbar-rfp", 5] }).enabledSources, ["acbar-rfp"]);
  assert.deepEqual(normalizeSettingsPatch({ enabledSources: ["ghost"] }).enabledSources, DEFAULT_SETTINGS.enabledSources, "empty after filtering -> defaults");
});

test("normalizeSettingsPatch drops unknown keys and keeps only provided ones", () => {
  const out = normalizeSettingsPatch({ evil: 1, __proto__: { polluted: true }, settingsVersion: 1, reliefwebAppName: "  my-app  " });
  assert.deepEqual(Object.keys(out), ["reliefwebAppName"]);
  assert.equal(out.reliefwebAppName, "my-app");
  assert.deepEqual(normalizeSettingsPatch(null), {});
  assert.deepEqual(normalizeSettingsPatch("nope"), {});
});

test("normalizeSettingsPatch lowercases keyword lists and removes unsafe URLs", () => {
  const out = normalizeSettingsPatch({
    customKeywords: [" Gender ", "", "M&E"], targetGeographies: ["Kabul", 7],
    customSourceUrls: ["https://ok.org/t", "http://insecure.org", "https://127.0.0.1/x"], manualLinks: "https://x.org",
    notificationsEnabled: 0
  });
  assert.deepEqual(out.customKeywords, ["gender", "m&e"]);
  assert.deepEqual(out.targetGeographies, ["kabul"]);
  assert.deepEqual(out.customSourceUrls, ["https://ok.org/t"]);
  assert.deepEqual(out.manualLinks, []);
  assert.equal(out.notificationsEnabled, false);
});

test("resolveConcurrency / resolveTimeoutMs clamp stored values and default sensibly", () => {
  assert.equal(resolveConcurrency({ maxConcurrentFetches: 3 }), 3);
  assert.equal(resolveConcurrency({ maxConcurrentFetches: 0 }), 1);
  assert.equal(resolveConcurrency({}), DEFAULT_SETTINGS.maxConcurrentFetches);
  assert.equal(resolveTimeoutMs({ fetchTimeoutMs: 1 }), 5000);
  assert.equal(resolveTimeoutMs({}), DEFAULT_SETTINGS.fetchTimeoutMs);
});

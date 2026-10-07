import { test } from "node:test";
import assert from "node:assert/strict";
import { cardViewModel, planReconcile, SUMMARY_MAX, MAX_KEYWORDS } from "../extension/src/popup/card-model.js";

const NOW = Date.parse("2026-10-05T10:00:00Z");
const base = { id: "a", title: "Consultancy for M&E", url: "https://a.org/1", score: 72.4, status: "new", parserConfidence: 0.9 };

test("render.js imports without a DOM (template is looked up lazily)", async () => {
  const mod = await import("../extension/src/popup/render.js");
  assert.equal(typeof mod.renderList, "function");
  assert.equal(mod.buildCard, undefined, "buildCard is internal");
});

test("summary is hidden when it repeats the title and truncated otherwise", () => {
  assert.equal(cardViewModel({ ...base, summary: "  Consultancy for M&E " }, NOW).summary, "");
  const long = "x".repeat(SUMMARY_MAX + 50);
  assert.equal(cardViewModel({ ...base, summary: long }, NOW).summary.length, SUMMARY_MAX);
});

test("keywords cap at four with a +N overflow chip listing the rest; custom ones are flagged", () => {
  const vm = cardViewModel({ ...base, matchedKeywords: ["a", "b", "c", "d", "e", "f"], matchedCustomKeywords: ["b"] }, NOW);
  assert.equal(vm.keywords.length, MAX_KEYWORDS);
  assert.deepEqual(vm.keywords[1], { text: "b", custom: true });
  assert.equal(vm.keywords[0].custom, false);
  assert.deepEqual(vm.moreKeywords, { text: "+2", title: "e, f" });
  assert.equal(cardViewModel({ ...base, matchedKeywords: ["a"] }, NOW).moreKeywords, null);
});

test("save / dismiss labels follow the status", () => {
  assert.deepEqual(cardViewModel(base, NOW).actions, { saveLabel: "Save", saveActive: false, saveTitle: "Bookmark for follow-up", dismissLabel: "Dismiss" });
  const saved = cardViewModel({ ...base, status: "saved" }, NOW).actions;
  assert.equal(saved.saveLabel, "Saved");
  assert.equal(saved.saveActive, true);
  assert.equal(saved.saveTitle, "Move back to New");
  assert.equal(cardViewModel({ ...base, status: "dismissed" }, NOW).actions.dismissLabel, "Restore");
  assert.equal(cardViewModel({ ...base, status: undefined }, NOW).status, "new");
});

test("score is rounded and clamped; tier and tooltip follow it", () => {
  const vm = cardViewModel(base, NOW);
  assert.equal(vm.score.value, 72);
  assert.equal(vm.tier, "green");
  assert.equal(vm.score.tooltip, "Relevance 72/100 · parser confidence 90%");
  assert.equal(cardViewModel({ ...base, score: 140 }, NOW).score.value, 100);
  assert.equal(cardViewModel({ ...base, score: -3 }, NOW).score.value, 0);
  assert.equal(cardViewModel({ ...base, score: undefined }, NOW).score.value, 0);
});

test("posted date falls back to first-seen; cluster text only for real clusters; untitled fallback", () => {
  const hourAgo = new Date(NOW - 3600000).toISOString();
  assert.equal(cardViewModel({ ...base, postedDate: hourAgo, firstSeenAt: hourAgo }, NOW).posted, "Posted 1h ago");
  assert.equal(cardViewModel({ ...base, firstSeenAt: hourAgo }, NOW).posted, "Found 1h ago");
  assert.equal(cardViewModel(base, NOW).posted, "");
  assert.equal(cardViewModel({ ...base, clusterSize: 3 }, NOW).cluster, "3 similar");
  assert.equal(cardViewModel({ ...base, clusterSize: 1 }, NOW).cluster, "");
  const untitled = cardViewModel({ ...base, title: "", url: "" }, NOW);
  assert.deepEqual(untitled.title, { text: "Untitled", href: "#", tooltip: "", rtl: false });
  assert.equal(cardViewModel({ ...base, notes: "x" }, NOW).hasNote, true);
});

test("planReconcile keeps item order and splits create / reuse / remove", () => {
  const plan = planReconcile(["b", "x", "a"], [{ id: "a" }, { id: "c" }, { id: "b" }]);
  assert.deepEqual(plan, { order: ["a", "c", "b"], create: ["c"], reuse: ["a", "b"], remove: ["x"] });
  assert.deepEqual(planReconcile([], []), { order: [], create: [], reuse: [], remove: [] });
});

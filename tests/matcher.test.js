import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunity, inferType, countMatches } from "../extension/src/lib/matcher.js";

const settings = { customKeywords: ["gender mainstreaming"], targetGeographies: ["afghanistan", "kabul"] };

test("countMatches is word-bounded so 'meal' does not match 'mealtime' but matches 'MEAL officer'", () => {
  assert.deepEqual(countMatches("mealtime catering", ["meal"]).matched, []);
  assert.deepEqual(countMatches("meal officer", ["meal"]).matched, ["meal"]);
  assert.deepEqual(countMatches("monitoring and evaluation (m&e) expert", ["m&e"]).matched, ["m&e"]);
});

test("scoreOpportunity rewards consulting profile terms, geography and freshness", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const strong = scoreOpportunity({
    title: "Consultancy: Project Management and M&E capacity building for NGOs in Kabul",
    summary: "Request for proposal for training of trainers on gender mainstreaming",
    postedDate: "2026-10-03T00:00:00Z", parserConfidence: 0.9
  }, settings, now);
  assert.ok(strong.score >= 80, `expected high score, got ${strong.score}`);
  assert.equal(strong.type, "tender");
  assert.ok(strong.matchedKeywords.includes("project management"));
  assert.deepEqual(strong.matchedCustomKeywords, ["gender mainstreaming"]);

  const weak = scoreOpportunity({ title: "Supply and delivery of fuel supply to Herat office", summary: "", parserConfidence: 0.5 }, settings, now);
  assert.ok(weak.score < 30, `expected low score, got ${weak.score}`);
});

test("scoreOpportunity respects an explicit connector type and clamps to 0..100", () => {
  const r = scoreOpportunity({ title: "Water pumps", summary: "", type: "training" }, {}, Date.now());
  assert.equal(r.type, "training");
  assert.ok(r.score >= 0 && r.score <= 100);
});

test("scoreOpportunity does not mutate its input", () => {
  const raw = { title: "x", summary: "y" };
  const copy = { ...raw };
  scoreOpportunity(raw, settings);
  assert.deepEqual(raw, copy);
});

test("inferType", () => {
  assert.equal(inferType("invitation to bid for generators"), "tender");
  assert.equal(inferType("national consultant for gender"), "consultancy");
  assert.equal(inferType("leadership workshop"), "training");
  assert.equal(inferType("community resilience project"), "project");
  assert.equal(inferType("hello"), "other");
});

test("scoreOpportunity penalises notices a connector flagged as off-target", () => {
  const base = { title: "Consultant for final evaluation", summary: "", parserConfidence: 0.9 };
  const local = scoreOpportunity({ ...base, location: "Kabul" }, settings);
  const abroad = scoreOpportunity({ ...base, location: "Jordan", offTarget: true }, settings);
  assert.ok(abroad.score < local.score - 20, `${abroad.score} vs ${local.score}`);
});

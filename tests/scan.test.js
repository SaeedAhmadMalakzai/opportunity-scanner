import { test } from "node:test";
import assert from "node:assert/strict";
import { hashString, itemId, assignClusters, processRawItems, toCsv, csvEscape, filterAndSort, countByStatus } from "../extension/src/lib/scan.js";

test("hashString is stable and distinguishes near-identical strings", () => {
  assert.equal(hashString("abc"), hashString("abc"));
  assert.notEqual(hashString("abc"), hashString("abd"));
  assert.notEqual(itemId("https://a.org/1", "T"), itemId("https://a.org/2", "T"));
});

test("assignClusters groups titles with the same significant words and marks the best as primary", () => {
  const items = [
    { id: "a", title: "Request for Proposal: M&E training Kabul", score: 50 },
    { id: "b", title: "Request for Proposal – M&E Training (Kabul)", score: 70 },
    { id: "c", title: "Something unrelated", score: 10 }
  ];
  const out = assignClusters(items);
  assert.equal(out[0].clusterId, out[1].clusterId);
  assert.equal(out[0].clusterSize, 2);
  assert.equal(out[1].isClusterPrimary, true);
  assert.equal(out[0].isClusterPrimary, false);
  assert.equal(out[2].clusterSize, 1);
  assert.equal(items[0].clusterId, undefined, "input not mutated");
});

test("processRawItems drops expired, unsafe, duplicate and already-seen items and scores the rest", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const raw = [
    { title: "Consultancy for project management training", url: "https://a.org/1?b=1&a=2", summary: "", deadline: "2026-12-01" },
    { title: "Consultancy for project management training", url: "https://a.org/1?a=2&b=1", summary: "" },
    { title: "Expired tender", url: "https://a.org/2", deadline: "2026-01-01" },
    { title: "Seen already", url: "https://a.org/3" },
    { title: "Insecure", url: "http://a.org/4" },
    { title: "", url: "https://a.org/5" }
  ];
  const { items, stats } = processRawItems(raw, { minScore: 0 }, { "https://a.org/3": 1 }, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].canonicalUrl, "https://a.org/1?a=2&b=1");
  assert.deepEqual(stats, { expired: 1, duplicates: 1, belowScore: 0, unsafe: 2, seen: 1 });
  assert.ok(items[0].score > 0);
  assert.match(items[0].id, /^opp_/);
});

test("processRawItems treats undated notices older than six months as expired", () => {
  const now = Date.parse("2026-10-05T00:00:00Z");
  const { items, stats } = processRawItems([
    { title: "Old tender without deadline", url: "https://a.org/old", postedDate: "2025-02-10" },
    { title: "Recent tender without deadline", url: "https://a.org/new", postedDate: "2026-09-20" },
    { title: "Old but has a future deadline", url: "https://a.org/dl", postedDate: "2025-02-10", deadline: "2026-12-01" }
  ], { minScore: 0 }, {}, now);
  assert.deepEqual(items.map((i) => i.url).sort(), ["https://a.org/dl", "https://a.org/new"]);
  assert.equal(stats.expired, 1);
});

test("processRawItems enforces minScore", () => {
  const { items, stats } = processRawItems([{ title: "Water pumps", url: "https://a.org/9" }], { minScore: 90 });
  assert.equal(items.length, 0);
  assert.equal(stats.belowScore, 1);
});

test("csvEscape quotes commas/newlines and neutralises formula injection", () => {
  assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvEscape(null), "");
});

test("toCsv emits a header and one row per item", () => {
  const csv = toCsv([{ id: "1", title: "T, x", score: 5, matchedKeywords: ["a", "b"] }]);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^id,title,type,score/);
  assert.match(lines[1], /"T, x"/);
  assert.match(lines[1], /a; b/);
});

const sample = [
  { id: "1", title: "Alpha", score: 90, status: "new", type: "tender", deadline: "2026-11-01", firstSeenAt: "2026-10-01", sourceDomain: "b.org", matchedKeywords: ["pmp"], summary: "" },
  { id: "2", title: "Beta", score: 40, status: "saved", type: "training", deadline: null, firstSeenAt: "2026-10-03", sourceDomain: "a.org", matchedKeywords: [], summary: "", notes: "call them" },
  { id: "3", title: "Gamma", score: 60, status: "dismissed", type: "tender", deadline: "2026-10-10", firstSeenAt: "2026-10-02", sourceDomain: "a.org", matchedKeywords: ["pmp"], summary: "" }
];

test("filterAndSort hides dismissed by default and supports every filter", () => {
  assert.deepEqual(filterAndSort(sample).map((i) => i.id), ["1", "2"]);
  assert.deepEqual(filterAndSort(sample, { statusFilter: "dismissed" }).map((i) => i.id), ["3"]);
  assert.deepEqual(filterAndSort(sample, { typeFilter: "training" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filterAndSort(sample, { minScore: 50 }).map((i) => i.id), ["1"]);
  assert.deepEqual(filterAndSort(sample, { keywordFilter: "pmp" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filterAndSort(sample, { sourceFilter: "a.org" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filterAndSort(sample, { searchQuery: "call them" }).map((i) => i.id), ["2"], "search includes notes");
  assert.deepEqual(filterAndSort(sample, { sortBy: "deadline", statusFilter: "all" }).map((i) => i.id), ["1", "2"]);
  assert.deepEqual(filterAndSort(sample, { sortBy: "date" }).map((i) => i.id), ["2", "1"]);
  assert.deepEqual(filterAndSort(sample, { sortBy: "source" }).map((i) => i.id), ["2", "1"]);
});

test("filterAndSort hides closed notices unless showClosed or the item is saved", () => {
  const closed = [
    { id: "c1", title: "Closed new", score: 50, status: "new", deadline: "2000-01-01", matchedKeywords: [], summary: "" },
    { id: "c2", title: "Closed saved", score: 50, status: "saved", deadline: "2000-01-01", matchedKeywords: [], summary: "" },
    { id: "c3", title: "Open", score: 50, status: "new", deadline: "2999-01-01", matchedKeywords: [], summary: "" }
  ];
  assert.deepEqual(filterAndSort(closed).map((i) => i.id).sort(), ["c2", "c3"]);
  assert.deepEqual(filterAndSort(closed, { showClosed: true }).map((i) => i.id).sort(), ["c1", "c2", "c3"]);
});

test("countByStatus", () => {
  assert.deepEqual(countByStatus(sample), { total: 3, new: 1, saved: 1, dismissed: 1 });
});

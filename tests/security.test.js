import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHtml, anchors, metaContent, allElements, stripBetween, innerOf, attrValue, splitBlocks } from "../extension/src/lib/html.js";
import { parseAfghanTenders } from "../extension/src/lib/connectors/afghantenders.js";
import { parseUngmSearchResults } from "../extension/src/lib/connectors/ungm.js";
import { parseUnamaProcurement } from "../extension/src/lib/connectors/unama.js";
import { parseGovAfCards } from "../extension/src/lib/connectors/gov-af.js";
import { parseAcbarCards } from "../extension/src/lib/connectors/acbar.js";
import { parseActionAidListing } from "../extension/src/lib/connectors/actionaid.js";
import { parseUndpProjects } from "../extension/src/lib/connectors/undp.js";
import { parseHtmlListingPage, parseOpportunityPage } from "../extension/src/lib/parsers.js";
import { isSafeHttpsUrl, resolveHttpUrl, isPrivateHostname, expandIpv6 } from "../extension/src/lib/urls.js";
import { normalizeRawItem, processRawItems, filterAndSort } from "../extension/src/lib/scan.js";
import { runConnector } from "../extension/src/lib/connectors/index.js";
import { LIMITS } from "../extension/src/lib/types.js";

/* ── H1: hostile pages must parse in linear time ── */

const SIZE = 300 * 1024;
const BUDGET_MS = 400;
const repeat = (s) => s.repeat(Math.ceil(SIZE / s.length)).slice(0, SIZE);

function timed(label, fn) {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  assert.ok(ms < BUDGET_MS, `${label} took ${Math.round(ms)}ms on ${SIZE / 1024} KB of hostile input`);
}

test("html helpers stay linear on openers without closers", () => {
  timed("stripHtml <", () => stripHtml(repeat("<")));
  timed("stripHtml <script", () => stripHtml(repeat("<script ")));
  timed("stripHtml <!--", () => stripHtml(repeat("<!-- ")));
  timed("anchors", () => anchors(repeat("<a ")));
  timed("anchors href", () => anchors(repeat('<a href="x">')));
  timed("metaContent", () => metaContent(repeat('<meta property="og:title" '), "og:title"));
  timed("metaContent content", () => metaContent(repeat('<meta name="x" content="y">'), "description"));
  timed("allElements", () => allElements(repeat("<div "), /<div\b([^<>]*)>/gi, "</div>"));
  timed("stripBetween", () => stripBetween(repeat("<svg"), "<svg", "</svg>"));
  timed("splitBlocks", () => splitBlocks(repeat("<div role=\"row\" "), /<div role="row"[^<>]*data-noticeid="\d+"/g));
});

test("every connector parser stays linear on hostile input", () => {
  timed("afghantenders", () => parseAfghanTenders(repeat('<a class="job-item" ')));
  timed("afghantenders h5", () => parseAfghanTenders(repeat('<a class="job-item" href="/x/1"><h5 ')));
  timed("ungm", () => parseUngmSearchResults(repeat('<div role="row" data-noticeid="1" ')));
  timed("ungm svg", () => parseUngmSearchResults(repeat('<div role="row" data-noticeid="1" class="x"><svg ')));
  timed("unama", () => parseUnamaProcurement(repeat("<table ")));
  timed("unama td", () => parseUnamaProcurement(repeat("<table><tr><td ")));
  timed("gov-af", () => parseGovAfCards(repeat('<div class="card "><h2 class="card-title">'), { baseUrl: "https://moi.gov.af/", organization: "x", sourceDomain: "moi.gov.af", parserSource: "t" }));
  timed("acbar", () => parseAcbarCards(repeat('<div class="job-card"><span class="job-pill" '), { type: "tender", parserSource: "t" }));
  timed("actionaid", () => parseActionAidListing(repeat('<div class="standard-listing--item"><time ')));
  timed("undp", () => parseUndpProjects(repeat('<div class="content-card"><h5 ')));
  timed("listing", () => parseHtmlListingPage(repeat("<a "), "https://example.org/"));
  timed("page", () => parseOpportunityPage(repeat("<h1 "), "https://example.org/x"));
});

test("linear helpers still parse well-formed markup correctly", () => {
  const html = `<p>a</p><a class="x" href='/one'>One <b>bold</b></a><a href="/two">Two</a><a>no href</a>`;
  const list = allElements(html, /<a\b([^<>]*)>/gi, "</a>");
  assert.equal(list.length, 3);
  assert.equal(list[0].inner, "One <b>bold</b>");
  assert.equal(list[0].outer, `<a class="x" href='/one'>One <b>bold</b></a>`);
  assert.equal(attrValue(list[0].attrs, "href"), "/one");
  assert.equal(innerOf(html, /<p[^<>]*>/i, "</p>"), "a");
  assert.equal(innerOf(html, /<h1[^<>]*>/i, "</h1>"), "");
  assert.equal(stripBetween("x<SCRIPT>a</script>y<script>b", "<script", "</script>"), "x y", "an unclosed script block is dropped to the end, never kept as text");
  assert.equal(metaContent(`<meta content="B" name="description"><meta property="og:title" content='A'>`, "og:title"), "A");
  assert.equal(stripHtml("<<not a tag>> text <b>x</b>"), "< > text x", "stray angle brackets are left as text, inner tag-like runs are removed");
});

/* ── M2: IPv6 forms of private hosts ── */

test("expandIpv6", () => {
  assert.deepEqual(expandIpv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(expandIpv6("::ffff:7f00:1"), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  assert.deepEqual(expandIpv6("::ffff:127.0.0.1"), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
  assert.equal(expandIpv6("1:2:3:4:5:6:7:8:9"), null);
  assert.equal(expandIpv6("::g"), null);
  assert.equal(expandIpv6("1::2::3"), null);
});

test("private IPv6 literals are rejected as unsafe", () => {
  for (const u of ["https://[::ffff:127.0.0.1]/", "https://[::ffff:7f00:1]/", "https://[::]/", "https://[::1]/", "https://[64:ff9b::7f00:1]/", "https://[2002:7f00:1::]/", "https://[fe80::1]/", "https://[fc00::1]/", "https://[fd12::1]/", "https://[::ffff:10.0.0.1]/", "https://[2002:c0a8:101::]/"]) {
    assert.equal(isSafeHttpsUrl(u), false, u);
  }
  assert.equal(resolveHttpUrl("//[::ffff:7f00:1]/x", "https://example.com/"), null);
  assert.equal(isSafeHttpsUrl("https://[2606:4700:4700::1111]/"), true, "public IPv6 is allowed");
  assert.equal(isSafeHttpsUrl("https://[2002:808:808::]/"), true, "6to4 of a public address is allowed");
  assert.equal(isPrivateHostname("router.lan"), true);
  assert.equal(isPrivateHostname("svc.internal"), true);
  assert.equal(isPrivateHostname("nas.home.arpa"), true);
});

/* ── M1: scraped fields are allow-listed and capped before persistence ── */

test("normalizeRawItem caps every string, drops unknown keys and coerces types", () => {
  const huge = "t".repeat(100000);
  const n = normalizeRawItem({ title: huge, organization: huge, summary: huge, url: `https://a.org/${huge}`, deadline: 12345, postedDate: "2026-01-01", parserConfidence: "x", __proto__: { polluted: true }, extra: "no", externalRef: huge });
  assert.equal(n.title.length, 200);
  assert.equal(n.organization.length, 160);
  assert.equal(n.summary.length, 600);
  assert.equal(n.url.length, 2048);
  assert.equal(n.deadline, null);
  assert.equal(n.postedDate, "2026-01-01");
  assert.equal(n.parserConfidence, 0.5);
  assert.equal(n.externalRef.length, 64);
  assert.ok(!("extra" in n) && !("polluted" in n));
  assert.equal(normalizeRawItem(null), null);
});

test("processRawItems persists only the capped shape", () => {
  const { items } = processRawItems([{ title: "x".repeat(5000) + " consultancy", url: "https://a.org/1", summary: "s".repeat(5000), bogus: 1 }], { minScore: 0 });
  assert.equal(items.length, 1);
  assert.ok(items[0].title.length <= 200);
  assert.ok(items[0].summary.length <= 600);
  assert.ok(!("bogus" in items[0]));
});

test("runConnector caps the number of items a single source may return", async () => {
  const many = Array.from({ length: LIMITS.MAX_ITEMS_PER_SOURCE + 50 }, (_, i) => `<div class="job-card"><h2><a class="job-card__title" href="/en/site-rfq/${i}">Notice number ${i}</a></h2></div>`).join("");
  const r = await runConnector("acbar-rfp", { settings: {}, log() {}, fetchText: async () => many });
  assert.equal(r.items.length, LIMITS.MAX_ITEMS_PER_SOURCE);
});

/* ── L2: prototype keys cannot be used as ids or sort keys ── */

test("prototype-named keys are ignored by lookups", () => {
  const items = [{ id: "a", title: "A", score: 1, status: "new", matchedKeywords: [], summary: "" }];
  assert.doesNotThrow(() => filterAndSort(items, { sortBy: "__proto__" }));
  assert.equal(filterAndSort(items, { sortBy: "constructor" }).length, 1);
  const { stats } = processRawItems([{ title: "T", url: "https://a.org/p" }], { minScore: 0 }, Object.create({ "https://a.org/p": 1 }));
  assert.equal(stats.seen, 0, "inherited seenUrls keys do not count as seen");
});

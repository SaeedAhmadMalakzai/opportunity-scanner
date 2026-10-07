import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHtmlListingPage, parseOpportunityPage, extractDeadline } from "../extension/src/lib/parsers.js";

test("parseHtmlListingPage resolves relative links, skips nav noise and dedupes", () => {
  const html = `
    <a href="/">Home</a>
    <a href="/about">About us</a>
    <a href="/tenders/1">Request for quotation for training services in Kabul</a>
    <a href="/tenders/1">Request for quotation for training services in Kabul</a>
    <a href="https://other.org/x.png">Image link that is long enough to pass</a>
    <a href="http://insecure.org/t">Insecure listing that should be skipped entirely</a>`;
  const items = parseHtmlListingPage(html, "https://npa.example.org/tenders", { sourceType: "tender" });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://npa.example.org/tenders/1");
  assert.equal(items[0].location, "Kabul");
  assert.equal(items[0].type, "tender");
  assert.equal(items[0].sourceDomain, "npa.example.org", "source domain derived from the page URL");
});

test("parseOpportunityPage extracts title, deadline, posted date and org", () => {
  const html = `<html><head><title>Fallback</title><meta property="og:title" content="M&amp;E Consultant"><meta name="description" content="Short desc"></head>
  <body><h1>ignored</h1>Organization: Save the Children. Posted on: 1 October 2026. Deadline: 20 October 2026. Location Herat.</body></html>`;
  const it = parseOpportunityPage(html, "https://example.org/job/1");
  assert.equal(it.title, "M&E Consultant");
  assert.equal(it.summary, "Short desc");
  assert.equal(it.deadline, "2026-10-20T00:00:00.000Z");
  assert.equal(it.postedDate, "2026-10-01T00:00:00.000Z");
  assert.match(it.organization, /Save the Children/);
  assert.equal(it.location, "Herat");
});

test("extractDeadline handles 'Closing date' and 'Apply before'", () => {
  assert.equal(extractDeadline("Closing date: 2026-11-02"), "2026-11-02T00:00:00.000Z");
  assert.equal(extractDeadline("Apply before 15 Nov 2026 please"), "2026-11-15T00:00:00.000Z");
  assert.equal(extractDeadline("no date"), null);
});

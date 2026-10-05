import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, fixtureJson } from "./helpers/fixtures.js";
import { parseAcbarCards } from "../extension/src/lib/connectors/acbar.js";
import { parseUngmSearchResults, extractUngmToken, buildUngmSearchBody, ungmConnectors } from "../extension/src/lib/connectors/ungm.js";
import { parseWorldBankProjects, parseWorldBankProcurement } from "../extension/src/lib/connectors/worldbank.js";
import { parseAfghanTenders } from "../extension/src/lib/connectors/afghantenders.js";
import { parseActedTenders } from "../extension/src/lib/connectors/acted.js";
import { parseActionAidListing } from "../extension/src/lib/connectors/actionaid.js";
import { parseReliefWebJobs, parseReliefWebTraining, buildReliefWebUrl, reliefWebConnectors } from "../extension/src/lib/connectors/reliefweb.js";
import { CONNECTORS, getConnectorCatalog, runConnector, runPool, fetchAllConnectorItems, RETIRED_CONNECTOR_IDS } from "../extension/src/lib/connectors/index.js";
import { DEFAULT_SETTINGS } from "../extension/src/lib/types.js";

function assertItemShape(it) {
  for (const k of ["title", "organization", "type", "location", "deadline", "postedDate", "url", "sourceDomain", "summary", "parserConfidence", "parserSource"]) {
    assert.ok(k in it, `missing ${k}`);
  }
  assert.match(it.url, /^https:\/\//);
  assert.ok(it.title.length >= 5);
}

test("ACBAR RFP page parses cards with org, deadline and absolute url", () => {
  const items = parseAcbarCards(fixture("acbar_rfp.html"), { type: "tender", parserSource: "html:acbar-rfp" });
  assert.ok(items.length >= 5, `got ${items.length}`);
  items.forEach(assertItemShape);
  const first = items[0];
  assert.equal(first.url, "https://www.acbar.org/en/site-rfq/34866");
  assert.equal(first.deadline, "2026-10-20T00:00:00.000Z");
  assert.ok(first.organization.length > 3);
  assert.equal(first.type, "tender");
});

test("ACBAR jobs page parses location pills and NEW badges", () => {
  const items = parseAcbarCards(fixture("acbar_jobs.html"), { type: "consultancy", parserSource: "html:acbar-jobs" });
  assert.ok(items.length >= 4);
  items.forEach(assertItemShape);
  assert.equal(items[0].location, "Jawzjan");
  assert.equal(items[0].organization, "ADWSO");
  assert.equal(items[0].deadline, "2026-10-08T00:00:00.000Z");
  assert.ok(items[0].postedDate, "NEW badge sets a posted date");
});

test("UNGM search fragment parses title, deadline, published, agency, type, reference and country", () => {
  const items = parseUngmSearchResults(fixture("ungm_search.html"));
  assert.equal(items.length, 5);
  items.forEach(assertItemShape);
  const fao = items.find((i) => i.organization === "FAO");
  assert.ok(fao);
  assert.equal(fao.url, "https://www.ungm.org/Public/Notice/316822");
  assert.equal(fao.deadline, "2026-10-19T00:00:00.000Z");
  assert.equal(fao.postedDate, "2026-10-05T00:00:00.000Z");
  assert.equal(fao.location, "Afghanistan");
  assert.equal(fao.externalRef, "2026/FAAFG/FAAFG/138540");
  assert.match(fao.summary, /Invitation to bid/);
  assert.equal(items[0].organization, "IOM");
});

test("UNGM token extraction and search body", () => {
  assert.ok(extractUngmToken(fixture("ungm_page_head.html")).length > 20);
  assert.equal(extractUngmToken("<html></html>"), null);
  const body = buildUngmSearchBody({ pageSize: 10, pageIndex: 2 });
  assert.deepEqual(body.Countries, [2293]);
  assert.equal(body.PageSize, 10);
  assert.equal(body.PageIndex, 2);
  assert.ok(buildUngmSearchBody().PageSize <= 15, "UNGM rejects larger pages");
});

test("UNGM connector fetches the page for a token, then POSTs with the token header", async () => {
  const calls = [];
  const ctx = {
    settings: {}, log() {},
    async fetchText(url, opts) {
      calls.push({ url, opts });
      return url.endsWith("/Search") ? fixture("ungm_search.html") : fixture("ungm_page_head.html");
    }
  };
  const items = await ungmConnectors["ungm-afghanistan"].fetchItems(ctx);
  assert.equal(items.length, 5);
  assert.equal(calls[1].opts.method, "POST");
  assert.ok(calls[1].opts.headers.RequestVerificationToken);
  assert.equal(calls[1].opts.credentials, "include");
  assert.equal(JSON.parse(calls[1].opts.body).Countries[0], 2293);
  assert.equal(calls.length, 2, "stops paging when a page is short");
});

test("UNGM connector pages until a short page and de-duplicates across pages", async () => {
  const full = fixture("ungm_search.html");
  const fiveRows = (prefix) => full.replace(/data-noticeid="(\d+)"/g, (_, id) => `data-noticeid="${prefix}${id}"`).replace(/\/Public\/Notice\/(\d+)/g, (_, id) => `/Public/Notice/${prefix}${id}`);
  let posts = 0;
  const ctx = {
    settings: {}, log() {},
    async fetchText(url, opts) {
      if (!url.endsWith("/Search")) return fixture("ungm_page_head.html");
      const idx = JSON.parse(opts.body).PageIndex;
      posts++;
      assert.equal(JSON.parse(opts.body).PageSize, 5);
      return idx < 2 ? fiveRows(String(idx + 1)) : "<div></div>";
    }
  };
  const { ungmConnectors: c } = await import("../extension/src/lib/connectors/ungm.js");
  const mod = await import("../extension/src/lib/connectors/ungm.js");
  void c;
  const items = await mod.searchUngmForTest(ctx, { pageSize: 5, maxPages: 5 });
  assert.equal(posts, 3);
  assert.equal(items.length, 10);
});

test("World Bank projects API", () => {
  const items = parseWorldBankProjects(fixtureJson("worldbank_projects.json"));
  assert.ok(items.length >= 1);
  items.forEach(assertItemShape);
  assert.equal(items[0].deadline, null, "project closing date is not a bid deadline");
  assert.match(items[0].url, /project-detail\/P\d+/);
});

test("World Bank procurement API drops contract awards and keeps deadlines", () => {
  const items = parseWorldBankProcurement(fixtureJson("worldbank_procnotices.json"));
  assert.equal(items.length, 2, "contract awards excluded");
  items.forEach(assertItemShape);
  assert.equal(items[0].type, "consultancy");
  assert.equal(items[0].deadline, "2026-06-12T00:00:00.000Z");
  assert.match(items[0].url, /procurement-detail\/OP\d+/);
  assert.match(items[0].summary, /Request for Expression of Interest/);
});

test("Afghan Tenders homepage parses promoted tender cards", () => {
  const items = parseAfghanTenders(fixture("afghantenders.html"));
  assert.ok(items.length >= 8, `got ${items.length}`);
  items.forEach(assertItemShape);
  assert.equal(items[0].url, "https://www.afghantenders.com/construction/24537");
  assert.equal(items[0].deadline, "2026-10-14T00:00:00.000Z");
  assert.match(items[0].summary, /Invitation to Bidding/);
  assert.ok(items[0].location.length > 1);
});

test("ACTED tenders list parses titles, posted dates and country", () => {
  const items = parseActedTenders(fixture("acted_tenders.html"));
  assert.ok(items.length >= 5);
  items.forEach(assertItemShape);
  const pakistan = items.find((i) => /Pakistan/.test(i.title));
  assert.ok(pakistan);
  assert.equal(pakistan.postedDate, "2026-01-09T00:00:00.000Z");
  assert.equal(pakistan.location, "Pakistan");
  assert.equal(items.find((i) => /West Bank/.test(i.title)).location, "OPT");
  assert.equal(pakistan.offTarget, true);
  const synthetic = parseActedTenders(`<div class="item item-rh"><div class="top"><div class="meta clearfix"><div class="float-right"> 10/02/2025</div></div> <a href="https://www.acted.org/en/tenders/rfq-jordan/" class="title"><h1>Request for Quotation_Jordan_Consultant for Final Evaluation</h1></a></div></div>`);
  assert.equal(synthetic[0].location, "Jordan", "underscore-separated titles still yield a country");
  assert.equal(synthetic[0].offTarget, true);
});

test("ActionAid Afghanistan jobs parse closing dates from <time>", () => {
  const items = parseActionAidListing(fixture("actionaid_jobs.html"));
  assert.equal(items.length, 3);
  items.forEach(assertItemShape);
  assert.equal(items[0].deadline, "2026-10-07T12:00:00.000Z");
  assert.match(items[0].url, /^https:\/\/afghanistan\.actionaid\.org\/jobs\/2026\//);
  assert.equal(items[0].type, "consultancy");
});

test("ReliefWeb parsers and url builder", () => {
  const json = { data: [{ fields: { title: "M&E Officer", url: "https://reliefweb.int/job/1", date: { created: "2026-10-01T00:00:00+00:00", closing: "2026-10-30T00:00:00+00:00" }, source: [{ name: "NRC" }], city: [{ name: "Kabul" }], type: [{ name: "Consultancy" }], "body-html": "<p>Body</p>" } }] };
  const jobs = parseReliefWebJobs(json);
  assert.equal(jobs.length, 1);
  assertItemShape(jobs[0]);
  assert.equal(jobs[0].organization, "NRC");
  assert.equal(jobs[0].deadline, "2026-10-30T00:00:00.000Z");
  const training = parseReliefWebTraining({ data: [{ fields: { title: "PM course", url: "https://reliefweb.int/training/2", date: { registration: "2026-11-01T00:00:00+00:00" } } }] });
  assert.equal(training[0].type, "training");
  assert.equal(training[0].deadline, "2026-11-01T00:00:00.000Z");
  const url = buildReliefWebUrl("jobs", "my-app", ["title"]);
  assert.match(url, /^https:\/\/api\.reliefweb\.int\/v2\/jobs\?appname=my-app/);
  assert.match(url, /filter%5Bvalue%5D=13/);
});

test("ReliefWeb connector fails with a helpful message when no appname is configured", async () => {
  await assert.rejects(reliefWebConnectors["reliefweb-jobs"].fetchItems({ settings: {}, fetchJson: async () => ({}) }), /appname/);
});

test("catalog and defaults are consistent; retired ids are gone", () => {
  const ids = getConnectorCatalog().map((c) => c.id);
  for (const id of DEFAULT_SETTINGS.enabledSources) assert.ok(ids.includes(id), `default ${id} missing`);
  for (const id of RETIRED_CONNECTOR_IDS) assert.ok(!ids.includes(id), `retired ${id} still present`);
  for (const c of getConnectorCatalog()) { assert.ok(c.label); assert.ok(c.description); assert.match(c.homepage, /^https:/); }
});

test("runConnector never throws and classifies empty/error/ok", async () => {
  const ok = await runConnector("acbar-rfp", { settings: {}, log() {}, fetchText: async () => fixture("acbar_rfp.html") });
  assert.equal(ok.health.status, "ok");
  assert.ok(ok.items.length > 0);
  const empty = await runConnector("acbar-rfp", { settings: {}, log() {}, fetchText: async () => "<html></html>" });
  assert.equal(empty.health.status, "empty");
  const err = await runConnector("acbar-rfp", { settings: {}, log() {}, fetchText: async () => { throw new Error("HTTP 500"); } });
  assert.equal(err.health.status, "error");
  assert.equal(err.health.error, "HTTP 500");
  const unknown = await runConnector("nope", { settings: {}, log() {} });
  assert.equal(unknown.health.status, "error");
});

test("runPool bounds concurrency and honours abort", async () => {
  let active = 0, peak = 0, ran = 0;
  const tasks = Array.from({ length: 8 }, () => async () => {
    active++; peak = Math.max(peak, active); ran++;
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  await runPool(tasks, 3);
  assert.equal(peak, 3);
  assert.equal(ran, 8);
  let count = 0;
  await runPool(Array.from({ length: 5 }, () => async () => { count++; }), 2, () => count >= 2);
  assert.ok(count <= 3, "stops scheduling after abort");
});

test("fetchAllConnectorItems runs enabled sources in parallel and reports health", async () => {
  const ctx = {
    settings: { enabledSources: ["acbar-rfp", "acbar-jobs", "ghost-source"], maxConcurrentFetches: 2 },
    log() {},
    fetchText: async (url) => (url.includes("jobs") ? fixture("acbar_jobs.html") : fixture("acbar_rfp.html"))
  };
  const progress = [];
  const { items, health } = await fetchAllConnectorItems(ctx, { onProgress: (p) => progress.push(p) });
  assert.ok(items.length > 8);
  assert.deepEqual(Object.keys(health).sort(), ["acbar-jobs", "acbar-rfp"]);
  assert.equal(progress.at(-1).done, 2);
  assert.equal(progress.at(-1).total, 2);
});

import { parseGovAfCards, govAfConnectors, GOV_AF_HOSTS } from "../extension/src/lib/connectors/gov-af.js";
import { parseUnamaProcurement } from "../extension/src/lib/connectors/unama.js";
import { parseUndpProjects } from "../extension/src/lib/connectors/undp.js";

test("Afghan ministry cards (English site) parse title, posted date, place and teaser", () => {
  const items = parseGovAfCards(fixture("govaf_mohia_en.html"), { baseUrl: "https://www.mohia.gov.af/en/all-tenders", organization: "MoHIA", sourceDomain: "mohia.gov.af", parserSource: "html:govaf-mohia" });
  assert.ok(items.length >= 3, `got ${items.length}`);
  items.forEach(assertItemShape);
  assert.match(items[0].url, /^https:\/\/www\.mohia\.gov\.af\/index\.php\/en\//);
  assert.equal(items[0].postedDate, "2026-09-26T00:00:00.000Z");
  assert.match(items[0].title, /petrol and diesel/i);
  assert.match(items[0].summary, /Procurement Law/);
});

test("Afghan ministry cards (Dari site) convert Jalali dates with Persian digits", () => {
  const items = parseGovAfCards(fixture("govaf_moi_dr.html"), { baseUrl: "https://moi.gov.af/dr/all-tenders", organization: "MoI", sourceDomain: "moi.gov.af", parserSource: "html:govaf-moi" });
  assert.ok(items.length >= 2);
  items.forEach(assertItemShape);
  assert.ok(items[0].postedDate && items[0].postedDate.startsWith("2026-"), `posted ${items[0].postedDate}`);
  assert.match(items[0].url, /^https:\/\/moi\.gov\.af\/(index\.php\/)?dr\//);
});

test("Afghan ministry cards (Pashto site) parse too", () => {
  const items = parseGovAfCards(fixture("govaf_moe_ps.html"), { baseUrl: "https://www.moe.gov.af/ps/all-tenders", organization: "MoE", sourceDomain: "moe.gov.af", parserSource: "html:govaf-moe" });
  assert.ok(items.length >= 2);
  items.forEach(assertItemShape);
});

test("ministry connector falls back to the next URL and dedupes", async () => {
  let calls = 0;
  const ctx = { settings: {}, log() {}, fetchText: async (url) => { calls++; if (url.includes("/dr/")) throw new Error("HTTP 500"); return fixture("govaf_mohia_en.html"); } };
  const items = await govAfConnectors["govaf-moi"].fetchItems(ctx);
  assert.equal(calls, 2);
  assert.ok(items.length >= 3);
  assert.ok(GOV_AF_HOSTS.includes("https://moi.gov.af/*"));
  assert.equal(Object.keys(govAfConnectors).length, 9);
});

test("UNAMA EOI table parses title, closing date, category and UNGM link", () => {
  const items = parseUnamaProcurement(fixture("unama_procurement.html"));
  assert.equal(items.length, 1);
  assertItemShape(items[0]);
  assert.match(items[0].title, /Commercial Sale/);
  assert.equal(items[0].deadline, "2026-06-07T00:00:00.000Z");
  assert.equal(items[0].url, "https://www.ungm.org/Public/Notice/300225");
  assert.equal(items[0].externalRef, "EOIUNAMA24401");
  assert.match(items[0].summary, /Office Equipment/);
});

test("UNDP Afghanistan projects parse content cards", () => {
  const items = parseUndpProjects(fixture("undp_projects.html"));
  assert.ok(items.length >= 4, `got ${items.length}`);
  items.forEach(assertItemShape);
  assert.match(items[0].url, /^https:\/\/www\.undp\.org\/afghanistan\/projects\//);
  assert.equal(items[0].type, "project");
  assert.match(items[0].title, /Access to Finance/);
});

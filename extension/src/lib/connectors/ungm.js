import { splitBlocks, stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

const BASE = "https://www.ungm.org/";
const NOTICE_PAGE = "https://www.ungm.org/Public/Notice";
const SEARCH_URL = "https://www.ungm.org/Public/Notice/Search";
export const UNGM_AFGHANISTAN_COUNTRY_ID = 2293;
/** UNGM rejects page sizes above ~20 with HTTP 400, so results are paged. */
export const UNGM_PAGE_SIZE = 15;
export const UNGM_MAX_PAGES = 3;
const ROW = /<div role="row"[^>]*data-noticeid="\d+"/g;

export function extractUngmToken(pageHtml) {
  return pageHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1]
    || pageHtml.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1]
    || null;
}

export function buildUngmSearchBody({ countryIds = [UNGM_AFGHANISTAN_COUNTRY_ID], agencyIds = [], pageSize = UNGM_PAGE_SIZE, pageIndex = 0 } = {}) {
  return {
    PageIndex: pageIndex, PageSize: pageSize, Title: "", Description: "", Reference: "",
    PublishedFrom: "", PublishedTo: "", DeadlineFrom: "", DeadlineTo: "",
    Countries: countryIds, Agencies: agencyIds, UNSPSCs: [], NoticeTypes: [],
    SortField: "DatePublished", SortAscending: false, isPicker: false,
    NoticeDisplayType: "", NoticeSearchTotalLabelId: "noticeSearchTotal", TypeOfCompetitions: []
  };
}

function cellText(block, re) {
  return stripHtml(block.match(re)?.[1] || "");
}

/** Parse the HTML fragment returned by UNGM's notice search endpoint. */
export function parseUngmSearchResults(html) {
  const items = [];
  for (const block of splitBlocks(html, ROW)) {
    const cleaned = block.replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/<span class=.info-tooltip__text.[\s\S]*?<\/span>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    const noticeId = cleaned.match(/data-noticeid="(\d+)"/)?.[1];
    const title = cellText(cleaned, /class="ungm-title[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const href = cleaned.match(/href=['"](\/Public\/Notice\/\d+)['"]/i)?.[1] || (noticeId ? `/Public/Notice/${noticeId}` : null);
    const url = href ? resolveHttpUrl(href, BASE) : null;
    if (!url || title.length < 5) continue;
    const deadlineRaw = cellText(cleaned, /class="tableCell resultInfo1 deadline"[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
    const publishedRaw = cellText(cleaned, /deadline"[\s\S]*?<\/div>\s*<div role="cell" class="tableCell">\s*<span>([\s\S]*?)<\/span>/i);
    const agency = cellText(cleaned, /class="tableCell resultAgency"[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
    const noticeType = cellText(cleaned, /<label for='[^']*'>([\s\S]*?)<\/label>/i);
    const reference = cellText(cleaned, /data-description="Reference"[^>]*>\s*<span>([\s\S]*?)<\/span>/i);
    const cells = [...cleaned.matchAll(/<div role="cell" class="tableCell">\s*<span>([\s\S]*?)<\/span>/gi)].map((m) => stripHtml(m[1]));
    const country = cells.length ? cells[cells.length - 1] : "";
    const type = /consult|individual contractor|expression of interest/i.test(`${noticeType} ${title}`) ? "consultancy" : "tender";
    items.push({
      title, organization: agency || "United Nations", type,
      location: country || "Afghanistan",
      deadline: normalizeDate(deadlineRaw.replace(/\(GMT[^)]*\)/i, "")),
      postedDate: normalizeDate(publishedRaw),
      url, sourceDomain: "ungm.org",
      summary: [noticeType, reference && `Ref ${reference}`, agency, country, title].filter(Boolean).join(" · ").slice(0, 400),
      parserConfidence: 0.92, parserSource: "html:ungm-search",
      externalRef: reference || null
    });
  }
  return items;
}

async function searchUngm(ctx, { pageSize = UNGM_PAGE_SIZE, maxPages = UNGM_MAX_PAGES, ...filters } = {}) {
  const page = await ctx.fetchText(NOTICE_PAGE, { credentials: "include" });
  const token = extractUngmToken(page);
  if (!token) throw new Error("UNGM anti-forgery token not found (page layout changed?)");
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "*/*",
    "X-Requested-With": "XMLHttpRequest",
    RequestVerificationToken: token
  };
  const items = [];
  const seen = new Set();
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const html = await ctx.fetchText(SEARCH_URL, {
      method: "POST", credentials: "include", headers,
      body: JSON.stringify(buildUngmSearchBody({ ...filters, pageSize, pageIndex }))
    });
    const rows = parseUngmSearchResults(html);
    let added = 0;
    for (const row of rows) if (!seen.has(row.url)) { seen.add(row.url); items.push(row); added++; }
    if (rows.length < pageSize || added === 0) break;
  }
  return items;
}

export const searchUngmForTest = searchUngm;

export const ungmConnectors = {
  "ungm-afghanistan": {
    label: "UNGM — All UN agencies (Afghanistan)",
    description: "Live procurement notices for Afghanistan from every UN agency on the UN Global Marketplace: UNDP, UNICEF, WFP, FAO, IOM, UNOPS, UN Women, UNHCR, WHO and more.",
    homepage: "https://www.ungm.org/Public/Notice",
    async fetchItems(ctx) {
      return searchUngm(ctx);
    }
  }
};

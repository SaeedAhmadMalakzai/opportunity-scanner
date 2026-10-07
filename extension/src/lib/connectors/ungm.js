import { allElements, innerOf, splitBlocks, stripBetween, stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, SUMMARY_MAX } from "./shared.js";

const BASE = "https://www.ungm.org/";
const NOTICE_PAGE = "https://www.ungm.org/Public/Notice";
const SEARCH_URL = "https://www.ungm.org/Public/Notice/Search";
export const UNGM_AFGHANISTAN_COUNTRY_ID = 2293;
/** UNGM rejects page sizes above ~20 with HTTP 400, so results are paged. */
export const UNGM_PAGE_SIZE = 15;
export const UNGM_MAX_PAGES = 3;
const ROW = /<div role="row"[^<>]*data-noticeid="\d+"/g;

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

function cellText(block, openRe, closeTag) {
  return stripHtml(innerOf(block, openRe, closeTag));
}

function withoutDecorations(block) {
  let s = stripBetween(block, "<svg", "</svg>");
  s = stripBetween(s, "<span class='info-tooltip__text'", "</span>");
  s = stripBetween(s, '<span class="info-tooltip__text"', "</span>");
  return stripBetween(s, "<script", "</script>");
}

/** The "published" cell is the plain cell that directly follows the deadline cell. */
function publishedText(cleaned) {
  const at = cleaned.indexOf('data-description="Deadline"');
  if (at === -1) return "";
  return cellText(cleaned.slice(at), /<\/div>\s*<div role="cell" class="tableCell">\s*<span>/i, "</span>");
}

/** Parse the HTML fragment returned by UNGM's notice search endpoint. */
export function parseUngmSearchResults(html) {
  const items = [];
  for (const block of splitBlocks(html, ROW)) {
    const cleaned = withoutDecorations(block);
    const noticeId = cleaned.match(/data-noticeid="(\d+)"/)?.[1];
    const title = cellText(cleaned, /class="ungm-title[^"<>]*"[^<>]*>/i, "</span>");
    const href = cleaned.match(/href=['"](\/Public\/Notice\/\d+)['"]/i)?.[1] || (noticeId ? `/Public/Notice/${noticeId}` : null);
    const url = href ? resolveHttpUrl(href, BASE) : null;
    if (!url || title.length < 5) continue;
    const deadlineRaw = cellText(cleaned, /class="tableCell resultInfo1 deadline"[^<>]*>\s*<span>/i, "</span>");
    const publishedRaw = publishedText(cleaned);
    const agency = cellText(cleaned, /class="tableCell resultAgency"[^<>]*>\s*<span>/i, "</span>");
    const noticeType = cellText(cleaned, /<label for='[^'<>]*'>/i, "</label>");
    const reference = cellText(cleaned, /data-description="Reference"[^<>]*>\s*<span>/i, "</span>");
    const cells = allElements(cleaned, /<div role="cell" class="tableCell">\s*<span>/gi, "</span>").map((c) => stripHtml(c.inner));
    const country = cells.length ? cells[cells.length - 1] : "";
    const type = /consult|individual contractor|expression of interest/i.test(`${noticeType} ${title}`) ? OPPORTUNITY_TYPES.CONSULTANCY : OPPORTUNITY_TYPES.TENDER;
    items.push({
      title, organization: agency || "United Nations", type,
      location: country || DEFAULT_LOCATION,
      deadline: normalizeDate(deadlineRaw.replace(/\(GMT[^)]*\)/i, "")),
      postedDate: normalizeDate(publishedRaw),
      url, sourceDomain: "ungm.org",
      summary: joinSummary([noticeType, reference && `Ref ${reference}`, agency, country, title], SUMMARY_MAX),
      parserConfidence: 0.92, parserSource: "html:ungm-search",
      externalRef: reference || null
    });
  }
  return items;
}

export async function searchUngm(ctx, { pageSize = UNGM_PAGE_SIZE, maxPages = UNGM_MAX_PAGES, ...filters } = {}) {
  const page = await ctx.fetchText(NOTICE_PAGE, { credentials: "include", redirect: "error" });
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
      method: "POST", credentials: "include", redirect: "error", headers,
      body: JSON.stringify(buildUngmSearchBody({ ...filters, pageSize, pageIndex }))
    });
    const rows = parseUngmSearchResults(html);
    let added = 0;
    for (const row of rows) if (!seen.has(row.url)) { seen.add(row.url); items.push(row); added++; }
    if (rows.length < pageSize || added === 0) break;
  }
  return items;
}

export const ungmConnectors = {
  "ungm-afghanistan": {
    label: "UNGM — All UN agencies (Afghanistan)",
    description: "Live procurement notices for Afghanistan from every UN agency on the UN Global Marketplace: UNDP, UNICEF, WFP, FAO, IOM, UNOPS, UN Women, UNHCR, WHO and more.",
    homepage: NOTICE_PAGE,
    fetchItems: (ctx) => searchUngm(ctx)
  }
};

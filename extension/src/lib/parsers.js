import { resolveHttpUrl } from "./urls.js";
import { stripHtml, textOf, metaContent, anchors, extractAfghanLocation, decodeEntities } from "./html.js";
import { normalizeDate } from "./dates.js";
import { OPPORTUNITY_TYPES } from "./types.js";

const LISTING_LIMIT = 40;
const MIN_LINK_TEXT = 15;
const MAX_LINK_TEXT = 300;
const TITLE_MAX = 200;
const LISTING_SUMMARY_MAX = 400;
const PAGE_SUMMARY_MAX = 600;
const LISTING_CONFIDENCE = 0.5;
/** Manual links on sites whose pages we know are well structured get a higher parser confidence. */
const MANUAL_PAGE_CONFIDENCE = Object.freeze({ "reliefweb.int": 0.9, "ungm.org": 0.88 });
const DEFAULT_PAGE_CONFIDENCE = 0.55;

const DEADLINE_RE = /(deadline|closing date|closing|due date|submission date|submission deadline|apply before|expires?)\s*[:\-–]?\s*([a-z0-9,\-\/.: ]{6,40})/i;
const POSTED_RE = /(posted on|posted|publication date|published on|published|date posted|issued on)\s*[:\-–]?\s*([a-z0-9,\-\/.: ]{6,40})/i;

export function extractDeadline(text) {
  const m = String(text ?? "").match(DEADLINE_RE);
  return normalizeDate(m?.[2]) || null;
}

export function extractPostedDate(text) {
  const m = String(text ?? "").match(POSTED_RE);
  return normalizeDate(m?.[2]) || null;
}

const NAV_NOISE = /^(home|about|about us|contact|contact us|login|log in|sign in|sign up|register|privacy|privacy policy|terms|terms of use|cookies?|search|menu|next|previous|prev|more|read more|learn more|back|top|share|print|download|subscribe|donate|careers?|jobs?|news|events|faq|help|sitemap|english|français|español|العربية|دری|پښتو)$/i;
const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mp4|mp3|zip|rar)(\?|$)/i;

/**
 * Generic listing parser for user-supplied listing pages: collect link texts that look like notice titles.
 * Returns at most `limit` items to bound noise; sourceDomain is the listing page's hostname.
 */
export function parseHtmlListingPage(html, baseUrl, { sourceType = OPPORTUNITY_TYPES.OTHER, limit = LISTING_LIMIT } = {}) {
  const sourceDomain = new URL(baseUrl).hostname;
  const items = [];
  const seen = new Set();
  const base = resolveHttpUrl(baseUrl, baseUrl) || baseUrl;
  for (const a of anchors(html)) {
    const href = resolveHttpUrl(a.href, baseUrl);
    if (!href || href === base || href === `${base}/` || SKIP_EXT.test(href)) continue;
    const txt = stripHtml(a.inner);
    if (txt.length < MIN_LINK_TEXT || txt.length > MAX_LINK_TEXT || NAV_NOISE.test(txt)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({
      title: txt.slice(0, TITLE_MAX), organization: "", type: sourceType,
      location: extractAfghanLocation(txt), deadline: extractDeadline(txt), postedDate: null,
      url: href, sourceDomain, summary: txt.slice(0, LISTING_SUMMARY_MAX), parserConfidence: LISTING_CONFIDENCE,
      parserSource: `listing:${sourceDomain}`
    });
    if (items.length >= limit) break;
  }
  return items;
}

function manualPageConfidence(host) {
  const known = Object.entries(MANUAL_PAGE_CONFIDENCE).find(([domain]) => host.includes(domain));
  return known ? known[1] : DEFAULT_PAGE_CONFIDENCE;
}

/** Parse a single opportunity page the user pasted as a manual link. */
export function parseOpportunityPage(html, url) {
  const host = new URL(url).hostname.toLowerCase();
  const body = stripHtml(html);
  const title = decodeEntities(
    metaContent(html, "og:title") ||
    textOf(html, /<h1[^<>]*>/i, "</h1>") ||
    textOf(html, /<title[^<>]*>/i, "</title>", "Untitled")
  ).slice(0, TITLE_MAX);
  const summary = decodeEntities(metaContent(html, "description") || body.slice(0, PAGE_SUMMARY_MAX)).slice(0, PAGE_SUMMARY_MAX);
  const org = body.match(/(?:organization|organisation|agency|borrower|employer)\s*[:\-–]\s*([a-z0-9,&.\- ]{3,100})/i)?.[1]?.trim() || "";
  return {
    title, organization: org, type: OPPORTUNITY_TYPES.OTHER, location: extractAfghanLocation(body),
    deadline: extractDeadline(body), postedDate: extractPostedDate(body),
    url, sourceDomain: host, summary, parserConfidence: manualPageConfidence(host),
    parserSource: "page:manual"
  };
}

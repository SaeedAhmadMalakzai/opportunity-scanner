import { resolveHttpUrl } from "./urls.js";
import { stripHtml, textBetween, metaContent, anchors, extractAfghanLocation, decodeEntities } from "./html.js";
import { normalizeDate } from "./dates.js";

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
 * Returns at most `limit` items to bound noise.
 */
export function parseHtmlListingPage(html, baseUrl, sourceDomain, sourceType = "other", limit = 40) {
  const items = [];
  const seen = new Set();
  const base = resolveHttpUrl(baseUrl, baseUrl) || baseUrl;
  for (const a of anchors(html)) {
    const href = resolveHttpUrl(a.href, baseUrl);
    if (!href || href === base || href === `${base}/` || SKIP_EXT.test(href)) continue;
    const txt = stripHtml(a.inner);
    if (txt.length < 15 || txt.length > 300 || NAV_NOISE.test(txt)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const deadline = extractDeadline(txt);
    items.push({
      title: txt.slice(0, 200), organization: "", type: sourceType,
      location: extractAfghanLocation(txt), deadline, postedDate: null,
      url: href, sourceDomain, summary: txt.slice(0, 400), parserConfidence: 0.5,
      parserSource: `listing:${sourceDomain}`
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Parse a single opportunity page the user pasted as a manual link. */
export function parseOpportunityPage(html, url) {
  const host = new URL(url).hostname.toLowerCase();
  const confidence = host.includes("reliefweb.int") ? 0.9 : host.includes("ungm.org") ? 0.88 : 0.55;
  const body = stripHtml(html);
  const title = decodeEntities(
    metaContent(html, "og:title") ||
    textBetween(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html, "") ||
    textBetween(/<title[^>]*>([\s\S]*?)<\/title>/i, html, "Untitled")
  ).slice(0, 200);
  const summary = decodeEntities(metaContent(html, "description") || body.slice(0, 600)).slice(0, 600);
  const org = body.match(/(?:organization|organisation|agency|borrower|employer)\s*[:\-–]\s*([a-z0-9,&.\- ]{3,100})/i)?.[1]?.trim() || "";
  return {
    title, organization: org, type: "other", location: extractAfghanLocation(body),
    deadline: extractDeadline(body), postedDate: extractPostedDate(body),
    url, sourceDomain: host, summary, parserConfidence: confidence,
    parserSource: "page:manual"
  };
}

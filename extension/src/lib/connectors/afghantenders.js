import { stripHtml, allElements, innerOf, attrValue } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, htmlConnector, TITLE_MAX, SUMMARY_MAX } from "./shared.js";

const BASE = "https://www.afghantenders.com/";
const ITEM_OPEN = /<a\b([^<>]*class="[^"<>]*job-item[^"<>]*"[^<>]*)>/gi;

export function parseAfghanTenders(html) {
  const items = [];
  const seen = new Set();
  for (const el of allElements(html, ITEM_OPEN, "</a>")) {
    const href = attrValue(el.attrs, "href");
    const url = href ? resolveHttpUrl(href, BASE) : null;
    if (!url || seen.has(url)) continue;
    const body = el.inner;
    const kind = stripHtml(innerOf(body, /<h5[^<>]*>/i, "</h5>"));
    const desc = stripHtml(innerOf(body, /<p[^<>]*class="[^"<>]*short_text[^"<>]*"[^<>]*>/i, "</p>"));
    const title = (desc || kind).slice(0, TITLE_MAX);
    if (title.length < 5) continue;
    seen.add(url);
    const deadline = normalizeDate(body.match(/Closing date:?\s*<\/strong>\s*([\d\-\/]+)/i)?.[1] || body.match(/Closing date:?\s*([\d\-\/]+)/i)?.[1] || "");
    const location = stripHtml(body.match(/icon-room[^>]*><\/span>\s*([^<|]+)/i)?.[1] || "") || DEFAULT_LOCATION;
    const category = body.match(/<img[^>]+alt="([^"]+)"/i)?.[1] || "";
    items.push({
      title, organization: "", type: OPPORTUNITY_TYPES.TENDER, location,
      deadline, postedDate: null, url, sourceDomain: "afghantenders.com",
      summary: joinSummary([kind, category, location, desc], SUMMARY_MAX),
      parserConfidence: 0.85, parserSource: "html:afghantenders"
    });
  }
  return items;
}

export const afghanTendersConnectors = {
  "afghantenders": htmlConnector({
    label: "Afghan Tenders — latest notices",
    description: "Afghanistan's largest tender aggregator: ITBs, RFQs and RFPs from government, NGOs and companies.",
    homepage: BASE,
    parse: parseAfghanTenders
  })
};

import { stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

const BASE = "https://www.afghantenders.com/";
const ITEM = /<a\b([^>]*class="[^"]*job-item[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;

export function parseAfghanTenders(html) {
  const items = [];
  const seen = new Set();
  let m;
  while ((m = ITEM.exec(html)) !== null) {
    const href = m[1].match(/href="([^"]+)"/i)?.[1];
    const url = href ? resolveHttpUrl(href, BASE) : null;
    if (!url || seen.has(url)) continue;
    const body = m[2];
    const kind = stripHtml(body.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
    const desc = stripHtml(body.match(/<p[^>]*class="[^"]*short_text[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
    const title = (desc || kind).slice(0, 200);
    if (title.length < 5) continue;
    seen.add(url);
    const deadline = normalizeDate(body.match(/Closing date:?\s*<\/strong>\s*([\d\-\/]+)/i)?.[1] || body.match(/Closing date:?\s*([\d\-\/]+)/i)?.[1] || "");
    const location = stripHtml(body.match(/icon-room[^>]*><\/span>\s*([^<|]+)/i)?.[1] || "") || "Afghanistan";
    const category = body.match(/<img[^>]+alt="([^"]+)"/i)?.[1] || "";
    items.push({
      title, organization: "", type: "tender", location,
      deadline, postedDate: null, url, sourceDomain: "afghantenders.com",
      summary: [kind, category, location, desc].filter(Boolean).join(" · ").slice(0, 400),
      parserConfidence: 0.85, parserSource: "html:afghantenders"
    });
  }
  ITEM.lastIndex = 0;
  return items;
}

export const afghanTendersConnectors = {
  "afghantenders": {
    label: "Afghan Tenders — latest notices",
    description: "Afghanistan's largest tender aggregator: ITBs, RFQs and RFPs from government, NGOs and companies.",
    homepage: BASE,
    async fetchItems(ctx) {
      return parseAfghanTenders(await ctx.fetchText(BASE));
    }
  }
};

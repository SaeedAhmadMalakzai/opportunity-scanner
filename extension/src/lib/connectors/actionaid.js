import { splitBlocks, stripHtml, anchors } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

const BASE = "https://afghanistan.actionaid.org/";
const ITEM = /<div class="standard-listing--item[^"]*">/g;

export function parseActionAidListing(html) {
  const items = [];
  for (const block of splitBlocks(html, ITEM)) {
    const link = anchors(block).find((a) => /\/(jobs|tenders?|procurement)\//i.test(a.href));
    if (!link) continue;
    const url = resolveHttpUrl(link.href, BASE);
    const title = stripHtml(link.inner);
    if (!url || title.length < 5) continue;
    const kind = stripHtml(block.match(/class="content-type"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    const deadline = normalizeDate(block.match(/<time[^>]+datetime="([^"]+)"/i)?.[1] || "");
    const summary = stripHtml(block.match(/class="trimmed"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    items.push({
      title: title.slice(0, 200), organization: "ActionAid Afghanistan",
      type: /tender|procurement/i.test(`${kind} ${url}`) ? "tender" : "consultancy",
      location: "Afghanistan", deadline, postedDate: null, url, sourceDomain: "actionaid.org",
      summary: [kind, summary || title].filter(Boolean).join(" · ").slice(0, 400),
      parserConfidence: 0.9, parserSource: "html:actionaid"
    });
  }
  return items;
}

export const actionAidConnectors = {
  "actionaid-afghanistan": {
    label: "ActionAid Afghanistan — Jobs & tenders",
    description: "Vacancies, consultancies and tenders published by ActionAid's Afghanistan country office.",
    homepage: "https://afghanistan.actionaid.org/jobs",
    async fetchItems(ctx) {
      return parseActionAidListing(await ctx.fetchText("https://afghanistan.actionaid.org/jobs"));
    }
  }
};

import { stripHtml, anchors } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

const PAGE = "https://unama.unmissions.org/en/unama-procurement";

/** UNAMA lists current expressions of interest in a simple table: title | closing date | category | links. */
export function parseUnamaProcurement(html) {
  const items = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length < 2) continue;
      const titleText = stripHtml(cells[0].split(/<br\s*\/?>|<\/p>/i)[0]);
      if (!titleText || /^title of the eoi/i.test(titleText)) continue;
      const deadline = normalizeDate(stripHtml(cells[1] || ""));
      const category = stripHtml(cells[2] || "");
      const links = anchors(cells[3] || "").map((a) => resolveHttpUrl(a.href, PAGE)).filter(Boolean);
      const url = links.find((u) => /ungm\.org/.test(u)) || links[0] || PAGE;
      const ref = titleText.match(/\(([A-Z0-9]+)\)\s*$/)?.[1] || null;
      items.push({
        title: titleText.slice(0, 200), organization: "UNAMA", type: "tender", location: "Afghanistan",
        deadline, postedDate: null, url, sourceDomain: "unmissions.org",
        summary: ["Expression of interest", category, ref && `Ref ${ref}`].filter(Boolean).join(" · ").slice(0, 400),
        parserConfidence: 0.85, parserSource: "html:unama", externalRef: ref
      });
    }
  }
  return items;
}

export const unamaConnectors = {
  "unama-procurement": {
    label: "UNAMA — Expressions of interest",
    description: "Current calls for expression of interest published by the UN Assistance Mission in Afghanistan.",
    homepage: PAGE,
    async fetchItems(ctx) {
      return parseUnamaProcurement(await ctx.fetchText(PAGE));
    }
  }
};

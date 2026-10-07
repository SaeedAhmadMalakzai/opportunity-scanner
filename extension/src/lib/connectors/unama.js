import { allElements, anchors, stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, htmlConnector, TITLE_MAX, SUMMARY_MAX } from "./shared.js";

const PAGE = "https://unama.unmissions.org/en/unama-procurement";

/** UNAMA lists current expressions of interest in a simple table: title | closing date | category | links. */
export function parseUnamaProcurement(html) {
  const items = [];
  for (const table of allElements(html, /<table[^<>]*>/gi, "</table>")) {
    for (const row of allElements(table.inner, /<tr[^<>]*>/gi, "</tr>")) {
      const cells = allElements(row.inner, /<td[^<>]*>/gi, "</td>").map((c) => c.inner);
      if (cells.length < 2) continue;
      const titleText = stripHtml(cells[0].split(/<br\s*\/?>|<\/p>/i)[0]);
      if (!titleText || /^title of the eoi/i.test(titleText)) continue;
      const deadline = normalizeDate(stripHtml(cells[1] || ""));
      const category = stripHtml(cells[2] || "");
      const links = anchors(cells[3] || "").map((a) => resolveHttpUrl(a.href, PAGE)).filter(Boolean);
      const url = links.find((u) => /ungm\.org/.test(u)) || links[0] || PAGE;
      const ref = titleText.match(/\(([A-Z0-9]+)\)\s*$/)?.[1] || null;
      items.push({
        title: titleText.slice(0, TITLE_MAX), organization: "UNAMA", type: OPPORTUNITY_TYPES.TENDER, location: DEFAULT_LOCATION,
        deadline, postedDate: null, url, sourceDomain: "unmissions.org",
        summary: joinSummary(["Expression of interest", category, ref && `Ref ${ref}`], SUMMARY_MAX),
        parserConfidence: 0.85, parserSource: "html:unama", externalRef: ref
      });
    }
  }
  return items;
}

export const unamaConnectors = {
  "unama-procurement": htmlConnector({
    label: "UNAMA — Expressions of interest",
    description: "Current calls for expression of interest published by the UN Assistance Mission in Afghanistan.",
    homepage: PAGE,
    parse: parseUnamaProcurement
  })
};

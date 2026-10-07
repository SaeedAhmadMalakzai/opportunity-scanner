import { anchors, innerOf, splitBlocks, stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, htmlConnector, TITLE_MAX, SUMMARY_MAX } from "./shared.js";

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
    const kind = stripHtml(innerOf(block, /class="content-type"[^<>]*>/i, "</span>"));
    const deadline = normalizeDate(block.match(/<time[^<>]+datetime="([^"<>]+)"/i)?.[1] || "");
    const summary = stripHtml(innerOf(block, /class="trimmed"[^<>]*>/i, "</div>"));
    items.push({
      title: title.slice(0, TITLE_MAX), organization: "ActionAid Afghanistan",
      type: /tender|procurement/i.test(`${kind} ${url}`) ? OPPORTUNITY_TYPES.TENDER : OPPORTUNITY_TYPES.CONSULTANCY,
      location: DEFAULT_LOCATION, deadline, postedDate: null, url, sourceDomain: "actionaid.org",
      summary: joinSummary([kind, summary || title], SUMMARY_MAX),
      parserConfidence: 0.9, parserSource: "html:actionaid"
    });
  }
  return items;
}

export const actionAidConnectors = {
  "actionaid-afghanistan": htmlConnector({
    label: "ActionAid Afghanistan — Jobs & tenders",
    description: "Vacancies, consultancies and tenders published by ActionAid's Afghanistan country office.",
    homepage: "https://afghanistan.actionaid.org/jobs",
    parse: parseActionAidListing
  })
};

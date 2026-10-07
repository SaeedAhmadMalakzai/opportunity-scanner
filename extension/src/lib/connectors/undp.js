import { anchors, innerOf, splitBlocks, stripHtml } from "../html.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, htmlConnector, TITLE_MAX, SUMMARY_MAX } from "./shared.js";

const PAGE = "https://www.undp.org/afghanistan/projects";
const CARD = /<div class="content-card">/g;

/** UNDP country pages render each project as a `.content-card` with a link and an h5 title. */
export function parseUndpProjects(html) {
  const items = [];
  const seen = new Set();
  for (const block of splitBlocks(html, CARD)) {
    const link = anchors(block).find((a) => /\/projects\//.test(a.href));
    if (!link) continue;
    const url = resolveHttpUrl(link.href, PAGE);
    const title = stripHtml(innerOf(block, /<h5[^<>]*>/i, "</h5>"));
    if (!url || title.length < 5 || seen.has(url)) continue;
    seen.add(url);
    items.push({
      title: title.slice(0, TITLE_MAX), organization: "UNDP Afghanistan", type: OPPORTUNITY_TYPES.PROJECT, location: DEFAULT_LOCATION,
      deadline: null, postedDate: null, url, sourceDomain: "undp.org",
      summary: joinSummary(["UNDP Afghanistan project", title], SUMMARY_MAX), parserConfidence: 0.85, parserSource: "html:undp-projects"
    });
  }
  return items;
}

export const undpConnectors = {
  "undp-afghanistan-projects": htmlConnector({
    label: "UNDP Afghanistan — Projects",
    description: "Active UNDP country programme projects, useful for spotting upcoming sub-contracts and partnerships. UNDP tenders themselves are on UNGM.",
    homepage: PAGE,
    parse: parseUndpProjects
  })
};

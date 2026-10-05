import { splitBlocks, stripHtml, anchors } from "../html.js";
import { resolveHttpUrl } from "../urls.js";

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
    const title = stripHtml(block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
    if (!url || title.length < 5 || seen.has(url)) continue;
    seen.add(url);
    items.push({
      title: title.slice(0, 200), organization: "UNDP Afghanistan", type: "project", location: "Afghanistan",
      deadline: null, postedDate: null, url, sourceDomain: "undp.org",
      summary: `UNDP Afghanistan project · ${title}`.slice(0, 400), parserConfidence: 0.85, parserSource: "html:undp-projects"
    });
  }
  return items;
}

export const undpConnectors = {
  "undp-afghanistan-projects": {
    label: "UNDP Afghanistan — Projects",
    description: "Active UNDP country programme projects, useful for spotting upcoming sub-contracts and partnerships. UNDP tenders themselves are on UNGM.",
    homepage: PAGE,
    async fetchItems(ctx) {
      return parseUndpProjects(await ctx.fetchText(PAGE));
    }
  }
};

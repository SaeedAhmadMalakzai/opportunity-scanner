import { splitBlocks, stripHtml, anchors } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

const BASE = "https://www.acbar.org/";
const CARD = /<div class="job-card">/g;

/** Parse ACBAR's job-card listing (used by the RFP, RFQ and Jobs boards). */
export function parseAcbarCards(html, { type, parserSource }) {
  const items = [];
  for (const block of splitBlocks(html, CARD)) {
    const link = anchors(block).find((a) => /job-card__title/.test(a.attrs));
    if (!link) continue;
    const url = resolveHttpUrl(link.href, BASE);
    const title = stripHtml(link.inner);
    if (!url || title.length < 5) continue;
    const company = stripHtml(block.match(/class="job-card__company[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    const organization = company.split("•")[0].trim();
    const pills = [...block.matchAll(/<span class="job-pill"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => ({ raw: m[0], text: stripHtml(m[1]) }));
    const deadline = normalizeDate(pills.find((p) => /fa-calendar/.test(p.raw))?.text || "");
    const location = pills.find((p) => /fa-map-marker/.test(p.raw))?.text || "Afghanistan";
    const isNew = /job-badge--new/.test(block);
    items.push({
      title, organization, type, location,
      deadline, postedDate: isNew ? new Date().toISOString() : null,
      url, sourceDomain: "acbar.org",
      summary: [title, organization, location].filter(Boolean).join(" — ").slice(0, 400),
      parserConfidence: 0.93, parserSource
    });
  }
  return items;
}

export const acbarConnectors = {
  "acbar-rfp": {
    label: "ACBAR — Requests for Proposals",
    description: "RFPs posted by NGOs and agencies on the ACBAR coordination body's procurement board.",
    homepage: "https://www.acbar.org/en/site-rfq?r=Request%20for%20Proposal",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.acbar.org/en/site-rfq?r=Request%20for%20Proposal");
      return parseAcbarCards(html, { type: "tender", parserSource: "html:acbar-rfp" });
    }
  },
  "acbar-rfq": {
    label: "ACBAR — Requests for Quotations",
    description: "RFQs and ITBs for supplies and services posted on ACBAR.",
    homepage: "https://www.acbar.org/en/site-rfq?r=Request%20for%20Quotation",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.acbar.org/en/site-rfq?r=Request%20for%20Quotation");
      return parseAcbarCards(html, { type: "tender", parserSource: "html:acbar-rfq" });
    }
  },
  "acbar-jobs": {
    label: "ACBAR — Jobs & consultancies",
    description: "Vacancies and consultancy positions on ACBAR's jobs board (largest NGO job board in Afghanistan).",
    homepage: "https://www.acbar.org/en/jobs",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.acbar.org/en/jobs");
      return parseAcbarCards(html, { type: "consultancy", parserSource: "html:acbar-jobs" });
    }
  }
};

import { allElements, anchors, innerOf, splitBlocks, stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, htmlConnector, SUMMARY_MAX } from "./shared.js";

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
    const company = stripHtml(innerOf(block, /class="job-card__company[^"<>]*"[^<>]*>/i, "</div>"));
    const organization = company.split("•")[0].trim();
    const pills = allElements(block, /<span class="job-pill"[^<>]*>/gi, "</span>").map((el) => ({ raw: el.outer, text: stripHtml(el.inner) }));
    const deadline = normalizeDate(pills.find((p) => /fa-calendar/.test(p.raw))?.text || "");
    const location = pills.find((p) => /fa-map-marker/.test(p.raw))?.text || DEFAULT_LOCATION;
    const isNew = /job-badge--new/.test(block);
    items.push({
      title, organization, type, location,
      deadline, postedDate: isNew ? new Date().toISOString() : null,
      url, sourceDomain: "acbar.org",
      summary: joinSummary([title, organization, location], SUMMARY_MAX, { sep: " — " }),
      parserConfidence: 0.93, parserSource
    });
  }
  return items;
}

/** One ACBAR board: the listing page is also the homepage shown in Settings. */
function acbarBoard({ label, description, homepage, type, parserSource }) {
  return htmlConnector({ label, description, homepage, parse: (html) => parseAcbarCards(html, { type, parserSource }) });
}

export const acbarConnectors = {
  "acbar-rfp": acbarBoard({
    label: "ACBAR — Requests for Proposals",
    description: "RFPs posted by NGOs and agencies on the ACBAR coordination body's procurement board.",
    homepage: "https://www.acbar.org/en/site-rfq?r=Request%20for%20Proposal",
    type: OPPORTUNITY_TYPES.TENDER, parserSource: "html:acbar-rfp"
  }),
  "acbar-rfq": acbarBoard({
    label: "ACBAR — Requests for Quotations",
    description: "RFQs and ITBs for supplies and services posted on ACBAR.",
    homepage: "https://www.acbar.org/en/site-rfq?r=Request%20for%20Quotation",
    type: OPPORTUNITY_TYPES.TENDER, parserSource: "html:acbar-rfq"
  }),
  "acbar-jobs": acbarBoard({
    label: "ACBAR — Jobs & consultancies",
    description: "Vacancies and consultancy positions on ACBAR's jobs board (largest NGO job board in Afghanistan).",
    homepage: "https://www.acbar.org/en/jobs",
    type: OPPORTUNITY_TYPES.CONSULTANCY, parserSource: "html:acbar-jobs"
  })
};

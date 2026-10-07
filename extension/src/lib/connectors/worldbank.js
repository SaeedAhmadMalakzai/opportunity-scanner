import { stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";
import { OPPORTUNITY_TYPES, DEFAULT_LOCATION } from "../types.js";
import { joinSummary, TITLE_MAX } from "./shared.js";

const SUMMARY_MAX = 600;

const PROJECTS_API = "https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=AF&rows=50&os=0&apilang=en";
const PROCUREMENT_API = "https://search.worldbank.org/api/v2/procnotices?format=json&rows=100&project_ctry_name_exact=Afghanistan";

export function parseWorldBankProjects(json) {
  const projects = json?.projects || {};
  return Object.entries(projects).filter(([, p]) => p).map(([key, p]) => ({
    title: p.project_name || "Untitled World Bank project",
    organization: "World Bank", type: OPPORTUNITY_TYPES.PROJECT,
    location: p.countryname || DEFAULT_LOCATION,
    deadline: null,
    postedDate: normalizeDate(p.boardapprovaldate),
    url: `https://projects.worldbank.org/en/projects-operations/project-detail/${encodeURIComponent(p.id || key)}`,
    sourceDomain: "worldbank.org",
    summary: joinSummary([p.projectstatusdisplay && `Status: ${p.projectstatusdisplay}`, p.closingdate && `Closes ${String(p.closingdate).slice(0, 10)}`, String(p.project_abstract?.cdata || "").slice(0, 400)], SUMMARY_MAX),
    parserConfidence: 0.92, parserSource: "api:worldbank-projects"
  }));
}

export function parseWorldBankProcurement(json) {
  const rows = Array.isArray(json?.procnotices) ? json.procnotices : [];
  return rows
    .filter((n) => n && n.id && !/contract award/i.test(n.notice_type || ""))
    .map((n) => ({
      title: (n.bid_description || n.project_name || "Untitled notice").trim().slice(0, TITLE_MAX),
      organization: `World Bank · ${n.project_name || ""}`.trim(),
      type: /expression of interest|consult/i.test(`${n.notice_type} ${n.procurement_group}`) ? OPPORTUNITY_TYPES.CONSULTANCY : OPPORTUNITY_TYPES.TENDER,
      location: n.project_ctry_name || DEFAULT_LOCATION,
      deadline: normalizeDate(n.submission_date),
      postedDate: normalizeDate(n.noticedate),
      url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${encodeURIComponent(n.id)}`,
      sourceDomain: "worldbank.org",
      summary: joinSummary([n.notice_type, n.procurement_method_name, n.bid_reference_no && `Ref ${n.bid_reference_no}`, stripHtml(n.notice_text || "").slice(0, 300)], SUMMARY_MAX),
      parserConfidence: 0.95, parserSource: "api:worldbank-procurement",
      externalRef: n.bid_reference_no || null
    }));
}

export const worldBankConnectors = {
  "worldbank-procurement": {
    label: "World Bank — Procurement notices (Afghanistan)",
    description: "Official API: open bids and expressions of interest under World Bank financed projects in Afghanistan. Contract awards are filtered out.",
    homepage: "https://projects.worldbank.org/en/projects-operations/procurement",
    async fetchItems(ctx) {
      return parseWorldBankProcurement(await ctx.fetchJson(PROCUREMENT_API));
    }
  },
  "worldbank-projects": {
    label: "World Bank — Projects (Afghanistan)",
    description: "Official API: active and pipeline development projects, useful for anticipating upcoming sub-contracts.",
    homepage: "https://projects.worldbank.org/en/projects-operations/projects-list?countrycode_exact=AF",
    async fetchItems(ctx) {
      return parseWorldBankProjects(await ctx.fetchJson(PROJECTS_API));
    }
  }
};

import { stripHtml } from "../html.js";
import { normalizeDate } from "../dates.js";

const API = "https://api.reliefweb.int/v2";
const AFGHANISTAN_COUNTRY_ID = 13;
export const RELIEFWEB_APPNAME_HELP = "ReliefWeb requires a free, pre-approved appname (apidoc.reliefweb.int). Add yours in Settings.";

export function buildReliefWebUrl(resource, appname, fields) {
  const u = new URL(`${API}/${resource}`);
  u.searchParams.set("appname", appname);
  u.searchParams.set("filter[field]", "country.id");
  u.searchParams.set("filter[value]", String(AFGHANISTAN_COUNTRY_ID));
  u.searchParams.set("limit", "50");
  u.searchParams.set("preset", "latest");
  for (const f of fields) u.searchParams.append("fields[include][]", f);
  return u.toString();
}

function names(list) { return (list || []).map((x) => x?.name).filter(Boolean).join(", "); }

export function parseReliefWebJobs(json) {
  return (json?.data || []).map((d) => d.fields || {}).filter((f) => f.url && f.title).map((f) => ({
    title: f.title.slice(0, 200), organization: names(f.source), type: "consultancy",
    location: names(f.city) || "Afghanistan",
    deadline: normalizeDate(f.date?.closing), postedDate: normalizeDate(f.date?.created),
    url: f.url, sourceDomain: "reliefweb.int",
    summary: [names(f.type), names(f.career_categories), stripHtml(f["body-html"] || f.body || "").slice(0, 300)].filter(Boolean).join(" · ").slice(0, 500),
    parserConfidence: 0.95, parserSource: "api:reliefweb-jobs"
  }));
}

export function parseReliefWebTraining(json) {
  return (json?.data || []).map((d) => d.fields || {}).filter((f) => f.url && f.title).map((f) => ({
    title: f.title.slice(0, 200), organization: names(f.source), type: "training",
    location: names(f.city) || "Afghanistan",
    deadline: normalizeDate(f.date?.registration), postedDate: normalizeDate(f.date?.created),
    url: f.url, sourceDomain: "reliefweb.int",
    summary: [names(f.training_type), names(f.format), f.date?.start && `Starts ${String(f.date.start).slice(0, 10)}`, stripHtml(f["body-html"] || f.body || "").slice(0, 300)].filter(Boolean).join(" · ").slice(0, 500),
    parserConfidence: 0.95, parserSource: "api:reliefweb-training"
  }));
}

function requireAppName(ctx) {
  const name = String(ctx.settings?.reliefwebAppName || "").trim();
  if (!name) throw new Error(RELIEFWEB_APPNAME_HELP);
  return name;
}

export const reliefWebConnectors = {
  "reliefweb-jobs": {
    label: "ReliefWeb — Jobs & consultancies (Afghanistan)",
    description: "Official API. Needs a free ReliefWeb appname (set in Settings) because ReliefWeb blocks anonymous scraping.",
    homepage: "https://reliefweb.int/jobs?advanced-search=%28C13%29",
    requiresSetting: "reliefwebAppName",
    async fetchItems(ctx) {
      const url = buildReliefWebUrl("jobs", requireAppName(ctx), ["title", "url", "date", "source", "city", "type", "career_categories", "body-html"]);
      return parseReliefWebJobs(await ctx.fetchJson(url));
    }
  },
  "reliefweb-training": {
    label: "ReliefWeb — Training (Afghanistan)",
    description: "Official API. Needs the same ReliefWeb appname as the jobs connector.",
    homepage: "https://reliefweb.int/training?advanced-search=%28C13%29",
    requiresSetting: "reliefwebAppName",
    async fetchItems(ctx) {
      const url = buildReliefWebUrl("training", requireAppName(ctx), ["title", "url", "date", "source", "city", "training_type", "format", "body-html"]);
      return parseReliefWebTraining(await ctx.fetchJson(url));
    }
  }
};

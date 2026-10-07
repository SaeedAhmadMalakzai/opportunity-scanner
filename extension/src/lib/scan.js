/** Pure helpers for the scan pipeline (no chrome.* access) so they can be unit tested. */
import { ITEM_STATUS } from "./types.js";
import { canonicalUrl, isSafeHttpsUrl } from "./urls.js";
import { isExpired, ageInDays } from "./dates.js";
import { scoreOpportunity } from "./matcher.js";

/** Notices with no deadline are assumed closed once their posting is this old. */
export const MAX_UNDATED_AGE_DAYS = 180;

/** cyrb53: fast 53-bit string hash with far fewer collisions than a 32-bit djb2. */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function itemId(canonical, title) {
  return `opp_${hashString(`${canonical}:${String(title || "").trim().toLowerCase()}`)}`;
}

export function clusterKey(title) {
  return String(title || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ")
    .trim().split(" ").filter((w) => w.length > 2).sort().slice(0, 6).join("-");
}

/** Highest-scoring member of each cluster; ties go to the earliest item. */
function bestByCluster(keyed) {
  const best = new Map();
  for (const { it, cid } of keyed) {
    if (!cid) continue;
    const current = best.get(cid);
    if (!current || (it.score || 0) > (current.score || 0)) best.set(cid, it);
  }
  return best;
}

/** Returns a new array of items annotated with clusterId / clusterSize / isClusterPrimary. */
export function assignClusters(items) {
  const keyed = items.map((it) => {
    const k = clusterKey(it.title);
    return { it, cid: k ? `cl_${hashString(k)}` : null };
  });
  const sizes = new Map();
  for (const { cid } of keyed) if (cid) sizes.set(cid, (sizes.get(cid) || 0) + 1);
  const best = bestByCluster(keyed);
  return keyed.map(({ it, cid }) => {
    if (!cid) return { ...it, clusterId: null, clusterSize: 1, isClusterPrimary: true };
    return { ...it, clusterId: cid, clusterSize: sizes.get(cid), isClusterPrimary: it === best.get(cid) };
  });
}

/**
 * Turn raw connector output into scored, de-duplicated, non-expired opportunities.
 * @returns {{ items: object[], stats: { expired: number, duplicates: number, belowScore: number, unsafe: number } }}
 */
const FIELD_CAPS = Object.freeze({ title: 200, organization: 160, location: 80, summary: 600, url: 2048, type: 20, sourceDomain: 100, parserSource: 60, externalRef: 64, date: 40 });

function cappedString(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Allow-list and cap every field a connector produced before it is scored or persisted. Scraped pages are
 * untrusted: an unbounded title would otherwise be stored verbatim and could exhaust the storage quota.
 */
export function normalizeRawItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const confidence = Number(raw.parserConfidence);
  return {
    title: cappedString(raw.title, FIELD_CAPS.title),
    organization: cappedString(raw.organization, FIELD_CAPS.organization),
    location: cappedString(raw.location, FIELD_CAPS.location),
    summary: cappedString(raw.summary, FIELD_CAPS.summary),
    url: cappedString(raw.url, FIELD_CAPS.url),
    type: cappedString(raw.type, FIELD_CAPS.type),
    sourceDomain: cappedString(raw.sourceDomain, FIELD_CAPS.sourceDomain),
    parserSource: cappedString(raw.parserSource, FIELD_CAPS.parserSource),
    deadline: typeof raw.deadline === "string" ? raw.deadline.slice(0, FIELD_CAPS.date) : null,
    postedDate: typeof raw.postedDate === "string" ? raw.postedDate.slice(0, FIELD_CAPS.date) : null,
    parserConfidence: Number.isFinite(confidence) ? confidence : 0.5,
    externalRef: raw.externalRef ? cappedString(raw.externalRef, FIELD_CAPS.externalRef) : null,
    offTarget: Boolean(raw.offTarget)
  };
}

export function processRawItems(rawItems, settings, seenUrls = {}, now = Date.now()) {
  const stats = { expired: 0, duplicates: 0, belowScore: 0, unsafe: 0, seen: 0 };
  const batchSeen = new Set();
  const out = [];
  for (const unchecked of rawItems) {
    const raw = normalizeRawItem(unchecked);
    if (!raw?.url || !isSafeHttpsUrl(raw.url) || !raw.title) { stats.unsafe++; continue; }
    if (isExpired(raw.deadline, now)) { stats.expired++; continue; }
    if (!raw.deadline && (ageInDays(raw.postedDate, now) ?? 0) > MAX_UNDATED_AGE_DAYS) { stats.expired++; continue; }
    const canon = canonicalUrl(raw.url);
    if (batchSeen.has(canon)) { stats.duplicates++; continue; }
    batchSeen.add(canon);
    if (Object.hasOwn(seenUrls, canon)) { stats.seen++; continue; }
    const scored = scoreOpportunity(raw, settings, now);
    if (scored.score < (settings.minScore || 0)) { stats.belowScore++; continue; }
    out.push({ ...scored, id: itemId(canon, scored.title), canonicalUrl: canon });
  }
  return { items: assignClusters(out), stats };
}

export function csvEscape(v) {
  const s = v == null ? "" : String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const CSV_COLUMNS = ["id", "title", "type", "score", "status", "organization", "location", "deadline", "postedDate", "sourceDomain", "url", "matchedKeywords", "matchedCustomKeywords", "notes", "summary"];

export function toCsv(items) {
  const rows = [CSV_COLUMNS.join(",")];
  for (const it of items) {
    rows.push([
      it.id, it.title, it.type, it.score, it.status, it.organization, it.location,
      it.deadline, it.postedDate, it.sourceDomain, it.url,
      (it.matchedKeywords || []).join("; "), (it.matchedCustomKeywords || []).join("; "),
      it.notes || "", it.summary
    ].map(csvEscape).join(","));
  }
  return rows.join("\r\n");
}

const SORTERS = {
  score: (a, b) => (b.score || 0) - (a.score || 0) || String(a.title).localeCompare(String(b.title)),
  deadline: (a, b) => (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity),
  date: (a, b) => (b.firstSeenAt ? Date.parse(b.firstSeenAt) : 0) - (a.firstSeenAt ? Date.parse(a.firstSeenAt) : 0),
  source: (a, b) => String(a.sourceDomain || "").localeCompare(String(b.sourceDomain || "")) || (b.score || 0) - (a.score || 0)
};

export function filterAndSort(items, params = {}) {
  const min = Number(params.minScore ?? 0);
  const tf = params.typeFilter || "all";
  const sf = params.statusFilter || "all";
  const kf = params.keywordFilter || "all";
  const srcf = params.sourceFilter || "all";
  const sq = String(params.searchQuery || "").toLowerCase().trim();
  const showClosed = Boolean(params.showClosed);
  const sorter = Object.hasOwn(SORTERS, String(params.sortBy)) ? SORTERS[params.sortBy] : SORTERS.score;

  const filtered = items.filter((it) => {
    if ((it.score || 0) < min) return false;
    if (!showClosed && it.status !== ITEM_STATUS.SAVED && isExpired(it.deadline)) return false;
    if (tf !== "all" && it.type !== tf) return false;
    if (sf === "all" ? it.status === ITEM_STATUS.DISMISSED : it.status !== sf) return false;
    if (kf !== "all" && !(it.matchedKeywords || []).includes(kf)) return false;
    if (srcf !== "all" && it.sourceDomain !== srcf) return false;
    if (sq) {
      const hay = `${it.title || ""}\n${it.summary || ""}\n${it.organization || ""}\n${it.notes || ""}`.toLowerCase();
      if (!hay.includes(sq)) return false;
    }
    return true;
  });
  return [...filtered].sort(sorter);
}

export function countByStatus(items) {
  const counts = { total: items.length, new: 0, saved: 0, dismissed: 0 };
  for (const it of items) {
    if (it.status === ITEM_STATUS.NEW) counts.new++;
    else if (it.status === ITEM_STATUS.SAVED) counts.saved++;
    else if (it.status === ITEM_STATUS.DISMISSED) counts.dismissed++;
  }
  return counts;
}

function countsDescending(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

/** Keyword and source facets (with counts) over every non-dismissed item, most common first. */
export function collectFacets(items) {
  const keywords = new Map();
  const sources = new Map();
  for (const it of items) {
    if (it.status === ITEM_STATUS.DISMISSED) continue;
    for (const k of it.matchedKeywords || []) keywords.set(k, (keywords.get(k) || 0) + 1);
    if (it.sourceDomain) sources.set(it.sourceDomain, (sources.get(it.sourceDomain) || 0) + 1);
  }
  return { keywords: countsDescending(keywords), sources: countsDescending(sources) };
}

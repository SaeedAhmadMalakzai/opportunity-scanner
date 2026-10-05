import { DEFAULT_SETTINGS, ITEM_STATUS, SETTINGS_VERSION, LIMITS } from "./types.js";
import { RETIRED_CONNECTOR_IDS, CONNECTORS } from "./connectors/index.js";

export const KEYS = Object.freeze({
  SETTINGS: "os_settings",
  OPPORTUNITIES: "os_opportunities",
  SCAN_STATE: "os_scanState",
  SEEN_URLS: "os_seenUrls",
  SOURCE_HEALTH: "os_sourceHealth"
});

function getLocal(keys) { return chrome.storage.local.get(keys); }
function setLocal(data) { return chrome.storage.local.set(data); }

/* In-memory cache of the (potentially multi-MB) opportunities map. Service workers restart often,
   so this is a best-effort accelerator for popup interactions, invalidated on every write. */
let oppCache = null;

/* ── Settings ── */

export function migrateSettings(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  const storedVersion = Number(stored?.settingsVersion || 0);
  let changed = storedVersion !== SETTINGS_VERSION;
  const known = new Set(Object.keys(CONNECTORS));
  const retired = new Set(RETIRED_CONNECTOR_IDS);
  let enabled = (merged.enabledSources || []).filter((id) => known.has(id) && !retired.has(id));
  if (storedVersion < SETTINGS_VERSION) {
    // New release: enable every default source the user has never seen so new connectors are not silently off.
    const previouslyKnown = new Set((stored?.enabledSources || []).filter((id) => known.has(id)));
    for (const id of DEFAULT_SETTINGS.enabledSources) if (!previouslyKnown.has(id) && !enabled.includes(id)) enabled.push(id);
    changed = true;
  }
  if (!enabled.length) enabled = [...DEFAULT_SETTINGS.enabledSources];
  if (enabled.length !== (merged.enabledSources || []).length) changed = true;
  return { settings: { ...merged, enabledSources: enabled, settingsVersion: SETTINGS_VERSION }, changed };
}

export async function getSettings() {
  const data = await getLocal([KEYS.SETTINGS]);
  const { settings, changed } = migrateSettings(data[KEYS.SETTINGS]);
  if (changed) await setLocal({ [KEYS.SETTINGS]: settings });
  return settings;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, settingsVersion: SETTINGS_VERSION };
  await setLocal({ [KEYS.SETTINGS]: next });
  return next;
}

/* ── Opportunities ── */

export async function getOpportunitiesMap() {
  if (oppCache) return oppCache;
  const data = await getLocal([KEYS.OPPORTUNITIES]);
  oppCache = data[KEYS.OPPORTUNITIES] || {};
  return oppCache;
}

async function writeOpportunities(map) {
  oppCache = map;
  await setLocal({ [KEYS.OPPORTUNITIES]: map });
}

export function invalidateCache() { oppCache = null; }

export function pruneOpportunityMap(map, max = LIMITS.MAX_OPPORTUNITIES) {
  const entries = Object.entries(map);
  if (entries.length <= max) return map;
  const rank = { [ITEM_STATUS.DISMISSED]: 0, [ITEM_STATUS.NEW]: 1, [ITEM_STATUS.SAVED]: 2 };
  const sorted = [...entries].sort((a, b) => {
    const ra = rank[a[1].status] ?? 1;
    const rb = rank[b[1].status] ?? 1;
    if (ra !== rb) return ra - rb;
    return String(a[1].lastUpdatedAt || "").localeCompare(String(b[1].lastUpdatedAt || ""));
  });
  return Object.fromEntries(sorted.slice(sorted.length - max));
}

export function mergeOpportunities(current, items, now = new Date().toISOString()) {
  const next = { ...current };
  for (const item of items) {
    if (!item?.id) continue;
    const existing = current[item.id];
    next[item.id] = {
      ...existing,
      ...item,
      status: existing?.status || ITEM_STATUS.NEW,
      notes: existing?.notes || "",
      firstSeenAt: existing?.firstSeenAt || now,
      lastUpdatedAt: now
    };
  }
  return pruneOpportunityMap(next);
}

export async function upsertOpportunities(items) {
  const current = await getOpportunitiesMap();
  await writeOpportunities(mergeOpportunities(current, items));
}

function assertStatus(status) {
  if (!Object.values(ITEM_STATUS).includes(status)) throw new Error("Invalid status.");
}

/** Set one item's status; returns the previous status (for undo) or null when the id is unknown. */
export async function setItemStatus(id, status) {
  assertStatus(status);
  const current = await getOpportunitiesMap();
  const item = current[id];
  if (!item) return null;
  await writeOpportunities({ ...current, [id]: { ...item, status, lastUpdatedAt: new Date().toISOString() } });
  return item.status;
}

export async function updateOpportunityNote(id, notes) {
  const current = await getOpportunitiesMap();
  const item = current[id];
  if (!item) return;
  await writeOpportunities({ ...current, [id]: { ...item, notes: String(notes || "").slice(0, LIMITS.MAX_NOTE_LENGTH), lastUpdatedAt: new Date().toISOString() } });
}

/** Bulk status change; returns { id: previousStatus } for undo. */
export async function bulkUpdateStatus(ids, status) {
  assertStatus(status);
  const current = await getOpportunitiesMap();
  const now = new Date().toISOString();
  const previous = {};
  const next = { ...current };
  for (const id of ids || []) {
    if (!current[id]) continue;
    previous[id] = current[id].status;
    next[id] = { ...current[id], status, lastUpdatedAt: now };
  }
  await writeOpportunities(next);
  return previous;
}

/** Restore a map of { id: status } (undo helper). */
export async function restoreStatuses(previous) {
  const current = await getOpportunitiesMap();
  const now = new Date().toISOString();
  const next = { ...current };
  for (const [id, status] of Object.entries(previous || {})) {
    if (!current[id] || !Object.values(ITEM_STATUS).includes(status)) continue;
    next[id] = { ...current[id], status, lastUpdatedAt: now };
  }
  await writeOpportunities(next);
}

/* ── Seen URLs ── */

export async function getSeenUrls() {
  const data = await getLocal([KEYS.SEEN_URLS]);
  return data[KEYS.SEEN_URLS] || {};
}

export function mergeSeenUrls(seen, urls, now = Date.now(), ttl = LIMITS.SEEN_TTL_MS) {
  const next = {};
  for (const [url, ts] of Object.entries(seen || {})) if (now - Number(ts || 0) <= ttl) next[url] = ts;
  for (const url of urls || []) if (url) next[url] = now;
  return next;
}

export async function markUrlsSeen(urls) {
  const seen = await getSeenUrls();
  await setLocal({ [KEYS.SEEN_URLS]: mergeSeenUrls(seen, urls) });
}

/* ── Scan state ── */

const DEFAULT_SCAN_STATE = Object.freeze({
  isRunning: false, startedAt: null, lastScanAt: null, lastError: null,
  lastAddedCount: 0, totalScans: 0, lastLog: "", progress: null, lastStats: null
});

export async function getScanState() {
  const data = await getLocal([KEYS.SCAN_STATE]);
  return { ...DEFAULT_SCAN_STATE, ...(data[KEYS.SCAN_STATE] || {}) };
}

export async function setScanState(patch) {
  const current = await getScanState();
  const next = { ...current, ...patch };
  await setLocal({ [KEYS.SCAN_STATE]: next });
  return next;
}

/* ── Source health ── */

export async function getSourceHealth() {
  const data = await getLocal([KEYS.SOURCE_HEALTH]);
  return data[KEYS.SOURCE_HEALTH] || {};
}

export async function setSourceHealth(health) {
  const current = await getSourceHealth();
  await setLocal({ [KEYS.SOURCE_HEALTH]: { ...current, ...health } });
}

export async function clearAllData() {
  oppCache = null;
  await chrome.storage.local.remove([KEYS.OPPORTUNITIES, KEYS.SEEN_URLS, KEYS.SCAN_STATE, KEYS.SOURCE_HEALTH]);
}

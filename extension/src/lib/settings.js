/** Pure settings helpers: migration between releases and validation of untrusted patches. */
import { DEFAULT_SETTINGS, SETTINGS_BOUNDS, SETTINGS_VERSION } from "./types.js";
import { CONNECTORS, RETIRED_CONNECTOR_IDS } from "./connectors/index.js";
import { sanitizeUrlList } from "./urls.js";

const MAX_APP_NAME_LENGTH = 200;
const MAX_LIST_ENTRIES = 200;

export function migrateSettings(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  const storedVersion = Number(stored?.settingsVersion || 0);
  let changed = storedVersion !== SETTINGS_VERSION;
  const known = new Set(Object.keys(CONNECTORS));
  const retired = new Set(RETIRED_CONNECTOR_IDS);
  const storedSources = Array.isArray(merged.enabledSources) ? merged.enabledSources : [];
  let enabled = storedSources.filter((id) => known.has(id) && !retired.has(id));
  if (storedVersion < SETTINGS_VERSION) {
    // New release: enable every default source the user has never seen so new connectors are not silently off.
    const previouslyKnown = new Set((Array.isArray(stored?.enabledSources) ? stored.enabledSources : []).filter((id) => known.has(id)));
    const added = DEFAULT_SETTINGS.enabledSources.filter((id) => !previouslyKnown.has(id) && !enabled.includes(id));
    enabled = [...enabled, ...added];
    changed = true;
  }
  if (!enabled.length) enabled = [...DEFAULT_SETTINGS.enabledSources];
  if (enabled.length !== storedSources.length) changed = true;
  return { settings: { ...merged, enabledSources: enabled, settingsVersion: SETTINGS_VERSION }, changed };
}

/** Clamp a number-like value into { min, max }; non-finite input yields the fallback. */
export function clamp(value, { min, max }, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function lowercaseList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_LIST_ENTRIES);
}

function urlList(value) {
  return Array.isArray(value) ? sanitizeUrlList(value).slice(0, MAX_LIST_ENTRIES) : [];
}

function knownSourceIds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.enabledSources];
  const ids = [...new Set(value.filter((id) => typeof id === "string" && Object.hasOwn(CONNECTORS, id)))];
  return ids.length ? ids : [...DEFAULT_SETTINGS.enabledSources];
}

const NORMALIZERS = Object.freeze({
  minScore: (v) => clamp(v, SETTINGS_BOUNDS.minScore, DEFAULT_SETTINGS.minScore),
  highPriorityThreshold: (v) => clamp(v, SETTINGS_BOUNDS.highPriorityThreshold, DEFAULT_SETTINGS.highPriorityThreshold),
  scanIntervalHours: (v) => clamp(v, SETTINGS_BOUNDS.scanIntervalHours, DEFAULT_SETTINGS.scanIntervalHours),
  fetchTimeoutMs: (v) => clamp(v, SETTINGS_BOUNDS.fetchTimeoutMs, DEFAULT_SETTINGS.fetchTimeoutMs),
  maxConcurrentFetches: (v) => clamp(v, SETTINGS_BOUNDS.maxConcurrentFetches, DEFAULT_SETTINGS.maxConcurrentFetches),
  enabledSources: knownSourceIds,
  targetGeographies: (v) => lowercaseList(v, DEFAULT_SETTINGS.targetGeographies),
  customKeywords: (v) => lowercaseList(v, DEFAULT_SETTINGS.customKeywords),
  customSourceUrls: urlList,
  manualLinks: urlList,
  reliefwebAppName: (v) => (typeof v === "string" ? v.trim().slice(0, MAX_APP_NAME_LENGTH) : ""),
  notificationsEnabled: (v) => Boolean(v)
});

/**
 * Validate an untrusted settings patch (from the options page or any message sender).
 * Only known keys that are present in `raw` survive; each value is clamped / coerced / sanitised.
 */
export function normalizeSettingsPatch(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, normalize] of Object.entries(NORMALIZERS)) {
    if (Object.hasOwn(raw, key)) out[key] = normalize(raw[key]);
  }
  return out;
}

export function resolveConcurrency(settings) {
  return clamp(settings?.maxConcurrentFetches, SETTINGS_BOUNDS.maxConcurrentFetches, DEFAULT_SETTINGS.maxConcurrentFetches);
}

export function resolveTimeoutMs(settings) {
  return clamp(settings?.fetchTimeoutMs, SETTINGS_BOUNDS.fetchTimeoutMs, DEFAULT_SETTINGS.fetchTimeoutMs);
}

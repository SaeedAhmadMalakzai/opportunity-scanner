export const APP_NAME = "Opportunity Scanner";
export const SETTINGS_VERSION = 14;

export const OPPORTUNITY_TYPES = Object.freeze({
  TENDER: "tender",
  PROJECT: "project",
  TRAINING: "training",
  CONSULTANCY: "consultancy",
  OTHER: "other"
});

export const ITEM_STATUS = Object.freeze({
  NEW: "new",
  SAVED: "saved",
  DISMISSED: "dismissed"
});

/** Message types exchanged between the popup/options pages and the service worker. */
export const MSG = Object.freeze({
  START_SCAN: "START_SCAN",
  STOP_SCAN: "STOP_SCAN",
  TEST_SOURCE: "TEST_SOURCE",
  GET_DASHBOARD: "GET_DASHBOARD",
  GET_CONNECTORS: "GET_CONNECTORS",
  GET_SCAN_STATE: "GET_SCAN_STATE",
  GET_SOURCE_HEALTH: "GET_SOURCE_HEALTH",
  GET_SETTINGS: "GET_SETTINGS",
  SAVE_SETTINGS: "SAVE_SETTINGS",
  EXPORT_CSV: "EXPORT_CSV",
  SET_STATUS: "SET_STATUS",
  SAVE_NOTE: "SAVE_NOTE",
  BULK_UPDATE: "BULK_UPDATE",
  CLEAR_DATA: "CLEAR_DATA",
  SCAN_PROGRESS: "SCAN_PROGRESS"
});

export const SCAN_PHASES = Object.freeze({
  CONNECTORS: "connectors",
  CUSTOM_SOURCES: "custom-sources",
  MANUAL_LINKS: "manual-links",
  SCORING: "scoring",
  SAVING: "saving",
  COMPLETE: "complete",
  STOPPED: "stopped",
  FAILED: "failed"
});

/** Location assumed when a source does not state one (every built-in source is Afghanistan-focused). */
export const DEFAULT_LOCATION = "Afghanistan";

/** chrome.storage.local keys owned by the popup/options pages (the service worker never reads them). */
export const PREF_KEYS = Object.freeze({
  THEME: "os_theme",
  DENSITY: "os_density",
  ONBOARDED: "os_onboarded",
  FILTERS: "os_filters"
});

export const LIMITS = Object.freeze({
  MAX_OPPORTUNITIES: 2500,
  SEEN_TTL_MS: 90 * 24 * 60 * 60 * 1000,
  MAX_NOTE_LENGTH: 2000,
  MAX_RESPONSE_BYTES: 3 * 1024 * 1024,
  MIN_SCAN_INTERVAL_MINUTES: 60,
  KEEPALIVE_INTERVAL_MS: 20000,
  MAX_NOTIFICATIONS_PER_SCAN: 5,
  MAX_ITEMS_PER_SOURCE: 500
});

export const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: SETTINGS_VERSION,
  minScore: 0,
  scanIntervalHours: 12,
  enabledSources: [
    "acbar-rfp", "acbar-rfq", "acbar-jobs",
    "ungm-afghanistan",
    "worldbank-procurement", "worldbank-projects",
    "afghantenders",
    "acted-tenders", "actionaid-afghanistan",
    "reliefweb-jobs", "reliefweb-training",
    "unama-procurement", "undp-afghanistan-projects",
    "govaf-moi", "govaf-moe", "govaf-mew", "govaf-mopw", "govaf-momp", "govaf-mcit", "govaf-moec", "govaf-molsa", "govaf-mohia"
  ],
  targetGeographies: ["afghanistan", "kabul", "herat", "mazar", "kandahar", "south asia"],
  highPriorityThreshold: 80,
  fetchTimeoutMs: 25000,
  maxConcurrentFetches: 4,
  customKeywords: [],
  customSourceUrls: [],
  manualLinks: [],
  reliefwebAppName: "",
  notificationsEnabled: true
});

/** Inclusive bounds for numeric settings; enforced at the service-worker boundary (see settings.js). */
export const SETTINGS_BOUNDS = Object.freeze({
  minScore: Object.freeze({ min: 0, max: 100 }),
  highPriorityThreshold: Object.freeze({ min: 50, max: 100 }),
  scanIntervalHours: Object.freeze({ min: 1, max: 48 }),
  fetchTimeoutMs: Object.freeze({ min: 5000, max: 60000 }),
  maxConcurrentFetches: Object.freeze({ min: 1, max: 8 })
});

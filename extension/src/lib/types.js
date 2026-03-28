export const APP_NAME = "Opportunity Scanner";
export const SETTINGS_VERSION = 11;

export const OPPORTUNITY_TYPES = {
  TENDER: "tender",
  PROJECT: "project",
  TRAINING: "training",
  CONSULTANCY: "consultancy",
  OTHER: "other"
};

export const ITEM_STATUS = {
  NEW: "new",
  SAVED: "saved",
  DISMISSED: "dismissed"
};

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  minScore: 0,
  scanIntervalHours: 12,
  enabledSources: [
    "acbar-rfp", "acbar-rfq", "reliefweb-jobs", "reliefweb-training",
    "worldbank-projects", "undp-procurement", "ungm-tenders", "unjobs-af",
    "unwomen-procurement", "unops-opportunities", "wfp-procurement",
    "unicef-supply", "fao-procurement", "iom-procurement", "afghantenders",
    "tendersontime-af", "acted-tenders", "akdn-procurement",
    "care-procurement", "actionaid-procurement"
  ],
  targetGeographies: ["afghanistan", "kabul", "herat", "mazar", "kandahar", "south asia"],
  highPriorityThreshold: 80,
  fetchTimeoutMs: 25000,
  maxConcurrentFetches: 3,
  customKeywords: [],
  customSourceUrls: [],
  manualLinks: []
};

import { DEFAULT_SETTINGS, ITEM_STATUS, SETTINGS_VERSION } from "./types.js";

const KEYS = {
  SETTINGS: "os_settings",
  OPPORTUNITIES: "os_opportunities",
  SCAN_STATE: "os_scanState",
  SEEN_URLS: "os_seenUrls"
};

function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

function setLocal(data) {
  return chrome.storage.local.set(data);
}

export async function getSettings() {
  const data = await getLocal([KEYS.SETTINGS]);
  const stored = data[KEYS.SETTINGS] || {};
  const merged = { ...DEFAULT_SETTINGS, ...stored };

  const storedVersion = stored.settingsVersion || 0;
  if (storedVersion !== SETTINGS_VERSION) {
    merged.enabledSources = DEFAULT_SETTINGS.enabledSources;
    merged.minScore = DEFAULT_SETTINGS.minScore;
    merged.settingsVersion = SETTINGS_VERSION;
    await setLocal({ [KEYS.SETTINGS]: merged });
  }

  return merged;
}

export async function saveSettings(settings) {
  const current = await getSettings();
  await setLocal({ [KEYS.SETTINGS]: { ...current, ...settings, settingsVersion: SETTINGS_VERSION } });
}

export async function getOpportunitiesMap() {
  const data = await getLocal([KEYS.OPPORTUNITIES]);
  return data[KEYS.OPPORTUNITIES] || {};
}

export async function getOpportunitiesCount() {
  const map = await getOpportunitiesMap();
  const all = Object.values(map);
  return {
    total: all.length,
    new: all.filter((i) => i.status === ITEM_STATUS.NEW).length,
    saved: all.filter((i) => i.status === ITEM_STATUS.SAVED).length
  };
}

export async function upsertOpportunities(items) {
  const current = await getOpportunitiesMap();
  for (const item of items) {
    const existing = current[item.id];
    current[item.id] = {
      ...existing,
      ...item,
      status: existing?.status || ITEM_STATUS.NEW,
      firstSeenAt: existing?.firstSeenAt || new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    };
  }
  await setLocal({ [KEYS.OPPORTUNITIES]: current });
}

export async function updateOpportunityStatus(id, status) {
  const current = await getOpportunitiesMap();
  if (!current[id]) return;
  current[id].status = status;
  current[id].lastUpdatedAt = new Date().toISOString();
  await setLocal({ [KEYS.OPPORTUNITIES]: current });
}

export async function getSeenUrls() {
  const data = await getLocal([KEYS.SEEN_URLS]);
  return data[KEYS.SEEN_URLS] || {};
}

export async function markUrlsSeen(urls) {
  const seen = await getSeenUrls();
  for (const url of urls) {
    seen[url] = Date.now();
  }
  await setLocal({ [KEYS.SEEN_URLS]: seen });
}

export async function getScanState() {
  const data = await getLocal([KEYS.SCAN_STATE]);
  return (
    data[KEYS.SCAN_STATE] || {
      isRunning: false,
      lastScanAt: null,
      lastError: null,
      lastAddedCount: 0,
      totalScans: 0
    }
  );
}

export async function setScanState(statePatch) {
  const current = await getScanState();
  await setLocal({
    [KEYS.SCAN_STATE]: { ...current, ...statePatch }
  });
}

export async function clearAllData() {
  await chrome.storage.local.remove([
    KEYS.OPPORTUNITIES,
    KEYS.SEEN_URLS,
    KEYS.SCAN_STATE
  ]);
}

import { fetchAllConnectorItems, getConnectorCatalog, runConnector, runPool } from "../lib/connectors/index.js";
import {
  getSettings, saveSettings, getSeenUrls, markUrlsSeen, setScanState, getScanState,
  getOpportunitiesMap, upsertOpportunities, setItemStatus, updateOpportunityNote,
  bulkUpdateStatus, restoreStatuses, clearAllData, setSourceHealth, getSourceHealth, invalidateCache
} from "../lib/storage.js";
import { parseOpportunityPage, parseHtmlListingPage } from "../lib/parsers.js";
import { processRawItems, filterAndSort, countByStatus, toCsv, collectFacets } from "../lib/scan.js";
import { sanitizeUrlList } from "../lib/urls.js";
import { normalizeSettingsPatch, resolveConcurrency } from "../lib/settings.js";
import { APP_NAME, MSG, SCAN_PHASES, LIMITS, DEFAULT_SETTINGS } from "../lib/types.js";
import { makeFetchers } from "./network.js";

const ALARM_NAME = "scheduledScan";
const MINUTES_PER_HOUR = 60;
const LOG_MAX_LINES = 400;
const PROGRESS_WRITE_INTERVAL_MS = 750;
const NOTIFICATION_ICON = "/icons/icon128.png";
const NOTIFICATION_PRIORITY = 2;
const NOTIFICATION_TITLE_MAX = 90;
const TEST_SAMPLE_SIZE = 5;
const SCAN_ALREADY_RUNNING = "A scan is already running.";
const SCAN_INTERRUPTED = "Previous scan was interrupted (browser or extension restarted).";

/* ── Scan lifecycle state (module scope; lost when the worker is recycled, which recoverInterruptedScan handles) ── */
let scanAborted = false;
/** Promise of the scan running in this worker, or null. Checked synchronously so concurrent starts cannot race. */
let activeScan = null;
let keepAliveTimer = null;
let recovered = false;
let lastProgressWrite = 0;
let scanLog = [];

function log(msg) {
  scanLog = [...scanLog, `[${new Date().toISOString().slice(11, 19)}] ${msg}`].slice(-LOG_MAX_LINES);
}
const logText = () => scanLog.join("\n");
const errorMessage = (err) => String(err?.message || err);

function broadcast(data) {
  chrome.runtime.sendMessage({ type: MSG.SCAN_PROGRESS, data }).catch(() => { /* no popup open to receive it */ });
}

/* MV3 workers idle out after 30s; an extension API call resets that timer. */
function startKeepAlive() {
  stopKeepAlive();
  // The ping only exists to keep the worker alive; its result (or failure) is irrelevant.
  keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), LIMITS.KEEPALIVE_INTERVAL_MS);
}
function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

/** A stored isRunning flag with no scan in this worker was left by a previous (killed) worker. */
async function recoverInterruptedScan() {
  if (recovered) return;
  const st = await getScanState();
  if (st.isRunning && !activeScan) {
    await setScanState({ isRunning: false, progress: null, lastError: SCAN_INTERRUPTED });
  }
  recovered = true;
}

/* ── Progress ── */

async function reportProgress(progress) {
  broadcast({ ...progress, log: logText() });
  const now = Date.now();
  const isFinal = progress.phase === SCAN_PHASES.COMPLETE || progress.phase === SCAN_PHASES.STOPPED;
  if (!isFinal && now - lastProgressWrite <= PROGRESS_WRITE_INTERVAL_MS) return;
  lastProgressWrite = now;
  await setScanState({ progress, lastLog: logText() });
}

/** Fire-and-forget progress for synchronous callbacks: a failed write is logged, never thrown. */
function reportProgressInBackground(progress) {
  reportProgress(progress).catch((e) => log(`progress write failed: ${errorMessage(e)}`));
}

/* ── User-supplied sources ── */

async function fetchUrlBatch(ctx, { urls, phase, title, label, parse }, concurrency) {
  if (!urls.length || scanAborted) return [];
  await reportProgress({ phase, total: urls.length, done: 0 });
  log(`${title}: ${urls.length}`);
  const results = [];
  await runPool(urls.map((url) => async () => {
    try { results.push(...parse(await ctx.fetchText(url), url)); }
    catch (e) { log(`FAIL ${label} ${new URL(url).hostname}: ${e.message}`); }
  }), concurrency, () => scanAborted);
  return results;
}

async function fetchUserSources(ctx, concurrency) {
  const custom = await fetchUrlBatch(ctx, {
    urls: sanitizeUrlList(ctx.settings.customSourceUrls || []), phase: SCAN_PHASES.CUSTOM_SOURCES,
    title: "Custom source pages", label: "custom source", parse: (html, url) => parseHtmlListingPage(html, url)
  }, concurrency);
  const manual = await fetchUrlBatch(ctx, {
    urls: sanitizeUrlList(ctx.settings.manualLinks || []), phase: SCAN_PHASES.MANUAL_LINKS,
    title: "Manual links", label: "manual link", parse: (html, url) => [parseOpportunityPage(html, url)]
  }, concurrency);
  return [...custom, ...manual];
}

const NOTIFICATION_ORG_MAX = 60;
const USER_SOURCE_PREFIX = "(your source) ";
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;

/** Notification text comes from scraped pages, so strip control characters and mark user-added sources. */
function notificationMessage(it) {
  const clean = (v, max) => String(v || "").replace(CONTROL_CHARS, " ").trim().slice(0, max);
  const fromUserSource = /^(listing:|page:manual)/.test(String(it.parserSource || ""));
  const title = `${fromUserSource ? USER_SOURCE_PREFIX : ""}${clean(it.title, NOTIFICATION_TITLE_MAX)}`;
  return `${title}\n${clean(it.organization || it.sourceDomain, NOTIFICATION_ORG_MAX)}`.trim();
}

async function notifyHighPriority(items, settings) {
  if (settings.notificationsEnabled === false) return;
  const threshold = Number(settings.highPriorityThreshold) || DEFAULT_SETTINGS.highPriorityThreshold;
  const top = items.filter((it) => it.score >= threshold).sort((a, b) => b.score - a.score).slice(0, LIMITS.MAX_NOTIFICATIONS_PER_SCAN);
  for (const it of top) {
    try {
      await chrome.notifications.create(`os_${it.id}`, {
        type: "basic", iconUrl: NOTIFICATION_ICON,
        title: `${APP_NAME}: score ${it.score}`,
        message: notificationMessage(it),
        priority: NOTIFICATION_PRIORITY
      });
    } catch (e) {
      log(`notification skipped: ${errorMessage(e)}`);
    }
  }
}

/* ── Scan ── */

/** Reset per-scan state, load settings and mark the scan as running. Resolves to the scan context. */
async function beginScan() {
  scanAborted = false;
  scanLog = [];
  startKeepAlive();
  log("Scan started");
  const [settings, seenUrls] = await Promise.all([getSettings(), getSeenUrls()]);
  await setScanState({
    isRunning: true, startedAt: new Date().toISOString(), lastError: null,
    progress: { phase: SCAN_PHASES.CONNECTORS, done: 0, total: (settings.enabledSources || []).length }
  });
  return { ctx: { settings, log, ...makeFetchers(settings) }, seenUrls, concurrency: resolveConcurrency(settings) };
}

async function collectRawItems({ ctx, concurrency }) {
  const { items: connectorItems, health } = await fetchAllConnectorItems(ctx, {
    onProgress: (p) => reportProgressInBackground({ phase: SCAN_PHASES.CONNECTORS, ...p }),
    shouldAbort: () => scanAborted
  });
  await setSourceHealth(health);
  log(`Connector items: ${connectorItems.length}`);
  const raw = [...connectorItems, ...await fetchUserSources(ctx, concurrency)];
  log(`Total raw items: ${raw.length}`);
  return { raw, health };
}

async function scoreAndPersist({ ctx, seenUrls }, raw) {
  await reportProgress({ phase: SCAN_PHASES.SCORING, items: raw.length });
  const { items, stats } = processRawItems(raw, ctx.settings, seenUrls);
  log(`Skipped: ${stats.expired} expired, ${stats.duplicates} duplicate, ${stats.seen} already known, ${stats.belowScore} below score, ${stats.unsafe} invalid`);
  log(`New opportunities: ${items.length}`);
  await reportProgress({ phase: SCAN_PHASES.SAVING, items: items.length });
  await upsertOpportunities(items);
  await markUrlsSeen(items.map((it) => it.canonicalUrl));
  await notifyHighPriority(items, ctx.settings);
  return { items, stats };
}

async function finalizeScan({ settings, rawCount, health, items, stats }) {
  const phase = scanAborted ? SCAN_PHASES.STOPPED : SCAN_PHASES.COMPLETE;
  log(scanAborted ? "Scan stopped by user; partial results saved" : "Scan complete");
  const prev = await getScanState();
  await setScanState({
    isRunning: false, lastScanAt: new Date().toISOString(), lastError: null,
    lastAddedCount: items.length, totalScans: (prev.totalScans || 0) + 1,
    lastLog: logText(), lastStats: { ...stats, raw: rawCount, added: items.length },
    progress: { phase, items: items.length, done: Object.keys(health).length, total: (settings.enabledSources || []).length }
  });
  broadcast({ phase, items: items.length, log: logText() });
}

async function failScan(err) {
  log(`Scan failed: ${errorMessage(err)}`);
  await setScanState({ isRunning: false, lastError: errorMessage(err), lastLog: logText(), progress: { phase: SCAN_PHASES.FAILED } });
  broadcast({ phase: SCAN_PHASES.FAILED, error: errorMessage(err), log: logText() });
}

async function runScan(begun) {
  try {
    const scan = await begun;
    const { raw, health } = await collectRawItems(scan);
    const { items, stats } = await scoreAndPersist(scan, raw);
    await finalizeScan({ settings: scan.ctx.settings, rawCount: raw.length, health, items, stats });
  } catch (err) {
    await failScan(err);
  } finally {
    stopKeepAlive();
  }
}

/** Start a scan unless one is already running in this worker; resolves once the running flag is stored. */
async function startScan() {
  if (activeScan) return { started: false, reason: SCAN_ALREADY_RUNNING };
  const begun = beginScan();
  activeScan = runScan(begun)
    .catch((e) => log(`scan crashed: ${errorMessage(e)}`))
    .finally(() => { activeScan = null; });
  try {
    await begun;
  } catch (e) {
    return { started: false, reason: `Scan could not start: ${errorMessage(e)}` };
  }
  return { started: true };
}

/* ── Queries ── */

async function getDashboard(params) {
  const all = Object.values(await getOpportunitiesMap());
  const [state, health] = await Promise.all([getScanState(), getSourceHealth()]);
  return {
    state, health,
    counts: countByStatus(all),
    items: filterAndSort(all, params),
    facets: collectFacets(all)
  };
}

async function exportCsv(payload = {}) {
  const rows = filterAndSort(Object.values(await getOpportunitiesMap()), payload);
  if (!Array.isArray(payload.ids) || !payload.ids.length) return toCsv(rows);
  const wanted = new Set(payload.ids);
  return toCsv(rows.filter((it) => wanted.has(it.id)));
}

async function testSource(id) {
  const settings = await getSettings();
  const lines = [];
  const ctx = { settings, log: (m) => lines.push(m), ...makeFetchers(settings) };
  const result = await runConnector(id, ctx);
  await setSourceHealth({ [id]: result.health });
  const sample = result.items.slice(0, TEST_SAMPLE_SIZE).map((it) => ({ title: it.title, deadline: it.deadline, url: it.url }));
  return { health: result.health, sample, log: lines };
}

/* ── Alarms & lifecycle ── */

async function ensureAlarm(settings) {
  const s = settings || await getSettings();
  const hours = Number(s.scanIntervalHours) || DEFAULT_SETTINGS.scanIntervalHours;
  const periodInMinutes = Math.max(LIMITS.MIN_SCAN_INTERVAL_MINUTES, hours * MINUTES_PER_HOUR);
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing || existing.periodInMinutes !== periodInMinutes) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes, delayInMinutes: periodInMinutes });
  }
}

async function onWorkerBoot() {
  try {
    invalidateCache();
    await recoverInterruptedScan();
    await ensureAlarm();
  } catch (e) {
    log(`worker boot failed: ${errorMessage(e)}`);
  }
}

chrome.runtime.onInstalled.addListener(onWorkerBoot);
chrome.runtime.onStartup.addListener(onWorkerBoot);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  startScan().catch((e) => log(`scheduled scan failed to start: ${errorMessage(e)}`));
});

/* ── Messages ── */

const handlers = {
  [MSG.START_SCAN]: () => startScan(),
  [MSG.STOP_SCAN]: async () => { scanAborted = true; log("Stop requested"); return { stopping: true }; },
  [MSG.TEST_SOURCE]: (p) => testSource(String(p?.id || "")),
  [MSG.GET_DASHBOARD]: (p) => getDashboard(p || {}),
  [MSG.GET_CONNECTORS]: () => getConnectorCatalog(),
  [MSG.GET_SCAN_STATE]: () => getScanState(),
  [MSG.GET_SOURCE_HEALTH]: () => getSourceHealth(),
  [MSG.GET_SETTINGS]: () => getSettings(),
  [MSG.SAVE_SETTINGS]: async (p) => { const s = await saveSettings(normalizeSettingsPatch(p)); await ensureAlarm(s); return s; },
  [MSG.EXPORT_CSV]: (p) => exportCsv(p || {}),
  [MSG.SET_STATUS]: async (p) => ({ previousStatus: await setItemStatus(String(p?.id || ""), p?.status) }),
  [MSG.SAVE_NOTE]: async (p) => { await updateOpportunityNote(String(p?.id || ""), p?.notes); return {}; },
  [MSG.BULK_UPDATE]: async (p) => {
    if (p?.restore) { await restoreStatuses(p.restore); return {}; }
    return { previous: await bulkUpdateStatus(Array.isArray(p?.ids) ? p.ids.map(String) : [], p?.status) };
  },
  [MSG.CLEAR_DATA]: async () => { await clearAllData(); return {}; }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[msg?.type];
  if (!handler) { sendResponse({ ok: false, error: "Unknown message type." }); return false; }
  (async () => {
    try {
      await recoverInterruptedScan();
      sendResponse({ ok: true, data: await handler(msg.payload) });
    } catch (e) {
      sendResponse({ ok: false, error: errorMessage(e) });
    }
  })();
  return true;
});

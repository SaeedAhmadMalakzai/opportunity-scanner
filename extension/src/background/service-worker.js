import { fetchAllConnectorItems, getConnectorCatalog, runConnector, runPool } from "../lib/connectors/index.js";
import {
  getSettings, saveSettings, getSeenUrls, markUrlsSeen, setScanState, getScanState,
  getOpportunitiesMap, upsertOpportunities, setItemStatus, updateOpportunityNote,
  bulkUpdateStatus, restoreStatuses, clearAllData, setSourceHealth, getSourceHealth, invalidateCache
} from "../lib/storage.js";
import { parseOpportunityPage, parseHtmlListingPage } from "../lib/parsers.js";
import { processRawItems, filterAndSort, countByStatus, toCsv } from "../lib/scan.js";
import { isSafeHttpsUrl, sanitizeUrlList } from "../lib/urls.js";
import { ITEM_STATUS, APP_NAME, MSG, SCAN_PHASES, LIMITS } from "../lib/types.js";

const ALARM_NAME = "scheduledScan";

/* ── Scan lifecycle state (module scope; lost when the worker is recycled, which recoverInterruptedScan handles) ── */
let scanAborted = false;
let scanInThisWorker = false;
let keepAliveTimer = null;
const scanLog = [];

function log(msg) {
  scanLog.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  if (scanLog.length > 400) scanLog.splice(0, scanLog.length - 400);
}

function broadcast(data) {
  chrome.runtime.sendMessage({ type: MSG.SCAN_PROGRESS, data }).catch(() => { /* no listener open */ });
}

/* MV3 workers idle out after 30s; an extension API call resets that timer. */
function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), LIMITS.KEEPALIVE_INTERVAL_MS);
}
function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

async function recoverInterruptedScan() {
  const st = await getScanState();
  if (st.isRunning && !scanInThisWorker) {
    await setScanState({ isRunning: false, progress: null, lastError: "Previous scan was interrupted (browser or extension restarted)." });
  }
}

/* ── Network ── */

async function readCapped(response, cap = LIMITS.MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader?.();
  if (!reader) return await response.text();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) { reader.cancel().catch(() => {}); throw new Error(`Response larger than ${Math.round(cap / 1048576)} MB`); }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return new TextDecoder("utf-8").decode(merged);
}

async function fetchRaw(url, { timeout = 25000, headers = {}, method = "GET", body, credentials = "omit", accept } = {}) {
  if (!isSafeHttpsUrl(url)) throw new Error("Blocked unsafe URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method, body, credentials, signal: controller.signal, redirect: "follow",
      headers: { Accept: accept, "Accept-Language": "en-US,en;q=0.9", ...headers }
    });
    if (response.url && !isSafeHttpsUrl(response.url)) throw new Error("Redirected to an unsafe host");
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
    return await readCapped(response);
  } catch (err) {
    if (err?.name === "AbortError") { const e = new Error(`Timed out after ${Math.round(timeout / 1000)}s`); e.name = "AbortError"; throw e; }
    if (err instanceof TypeError) throw new Error(`Network error reaching ${new URL(url).hostname} (offline, DNS, or permission denied)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function makeFetchers(settings) {
  const timeout = Number(settings.fetchTimeoutMs) || 25000;
  return {
    fetchText: (url, opts = {}) => fetchRaw(url, { timeout, accept: "text/html,application/xhtml+xml,*/*;q=0.8", ...opts }),
    fetchJson: async (url, opts = {}) => JSON.parse(await fetchRaw(url, { timeout, accept: "application/json", ...opts }))
  };
}

/* ── Scan ── */

let lastProgressWrite = 0;
async function reportProgress(progress) {
  broadcast({ ...progress, log: scanLog.join("\n") });
  const now = Date.now();
  if (now - lastProgressWrite > 750 || progress.phase === SCAN_PHASES.COMPLETE || progress.phase === SCAN_PHASES.STOPPED) {
    lastProgressWrite = now;
    await setScanState({ progress, lastLog: scanLog.join("\n") });
  }
}

async function fetchUserSources(ctx, settings, concurrency) {
  const items = [];
  const customUrls = sanitizeUrlList(settings.customSourceUrls || []);
  if (customUrls.length && !scanAborted) {
    await reportProgress({ phase: SCAN_PHASES.CUSTOM_SOURCES, total: customUrls.length, done: 0 });
    log(`Custom source pages: ${customUrls.length}`);
    await runPool(customUrls.map((url) => async () => {
      try { items.push(...parseHtmlListingPage(await ctx.fetchText(url), url, new URL(url).hostname, "other")); }
      catch (e) { log(`FAIL custom source ${new URL(url).hostname}: ${e.message}`); }
    }), concurrency, () => scanAborted);
  }
  const manualLinks = sanitizeUrlList(settings.manualLinks || []);
  if (manualLinks.length && !scanAborted) {
    await reportProgress({ phase: SCAN_PHASES.MANUAL_LINKS, total: manualLinks.length, done: 0 });
    log(`Manual links: ${manualLinks.length}`);
    await runPool(manualLinks.map((url) => async () => {
      try { items.push(parseOpportunityPage(await ctx.fetchText(url), url)); }
      catch (e) { log(`FAIL manual link ${new URL(url).hostname}: ${e.message}`); }
    }), concurrency, () => scanAborted);
  }
  return items;
}

async function notifyHighPriority(items, settings) {
  if (settings.notificationsEnabled === false) return;
  const threshold = Number(settings.highPriorityThreshold) || 80;
  const top = items.filter((it) => it.score >= threshold).sort((a, b) => b.score - a.score).slice(0, LIMITS.MAX_NOTIFICATIONS_PER_SCAN);
  for (const it of top) {
    try {
      await chrome.notifications.create(`os_${it.id}`, {
        type: "basic", iconUrl: "/icons/icon128.png",
        title: `${APP_NAME}: score ${it.score}`,
        message: `${(it.title || "").slice(0, 90)}\n${it.organization || it.sourceDomain || ""}`.trim(),
        priority: 2
      });
    } catch { /* notifications may be disabled at OS level */ }
  }
}

async function runScan() {
  scanInThisWorker = true;
  scanAborted = false;
  scanLog.length = 0;
  startKeepAlive();
  const startedAt = new Date().toISOString();
  try {
    log("Scan started");
    const settings = await getSettings();
    const seenUrls = await getSeenUrls();
    const concurrency = Math.max(1, Number(settings.maxConcurrentFetches) || 4);
    const ctx = { settings, log, ...makeFetchers(settings) };

    await setScanState({ isRunning: true, startedAt, lastError: null, progress: { phase: SCAN_PHASES.CONNECTORS, done: 0, total: (settings.enabledSources || []).length } });

    const { items: connectorItems, health } = await fetchAllConnectorItems(ctx, {
      onProgress: (p) => reportProgress({ phase: SCAN_PHASES.CONNECTORS, ...p }),
      shouldAbort: () => scanAborted
    });
    await setSourceHealth(health);
    log(`Connector items: ${connectorItems.length}`);

    const userItems = await fetchUserSources(ctx, settings, concurrency);
    const allRaw = [...connectorItems, ...userItems];
    log(`Total raw items: ${allRaw.length}`);

    await reportProgress({ phase: SCAN_PHASES.SCORING, items: allRaw.length });
    const { items, stats } = processRawItems(allRaw, settings, seenUrls);
    log(`Skipped: ${stats.expired} expired, ${stats.duplicates} duplicate, ${stats.seen} already known, ${stats.belowScore} below score, ${stats.unsafe} invalid`);
    log(`New opportunities: ${items.length}`);

    await reportProgress({ phase: SCAN_PHASES.SAVING, items: items.length });
    await upsertOpportunities(items);
    await markUrlsSeen(items.map((it) => it.canonicalUrl));
    await notifyHighPriority(items, settings);

    const phase = scanAborted ? SCAN_PHASES.STOPPED : SCAN_PHASES.COMPLETE;
    log(scanAborted ? "Scan stopped by user; partial results saved" : "Scan complete");
    const prev = await getScanState();
    await setScanState({
      isRunning: false, lastScanAt: new Date().toISOString(), lastError: null,
      lastAddedCount: items.length, totalScans: (prev.totalScans || 0) + 1,
      lastLog: scanLog.join("\n"), lastStats: { ...stats, raw: allRaw.length, added: items.length },
      progress: { phase, items: items.length, done: Object.keys(health).length, total: (settings.enabledSources || []).length }
    });
    broadcast({ phase, items: items.length, log: scanLog.join("\n") });
  } catch (err) {
    log(`Scan failed: ${err?.message || err}`);
    await setScanState({ isRunning: false, lastError: String(err?.message || err), lastLog: scanLog.join("\n"), progress: { phase: SCAN_PHASES.FAILED } });
    broadcast({ phase: SCAN_PHASES.FAILED, error: String(err?.message || err), log: scanLog.join("\n") });
  } finally {
    scanInThisWorker = false;
    stopKeepAlive();
  }
}

async function startScan() {
  await recoverInterruptedScan();
  const st = await getScanState();
  if (st.isRunning) return { started: false, reason: "A scan is already running." };
  await setScanState({ isRunning: true, lastError: null, progress: { phase: SCAN_PHASES.CONNECTORS, done: 0, total: 0 } });
  runScan().catch(() => {});
  return { started: true };
}

/* ── Queries ── */

function collectFacets(items) {
  const keywords = new Map();
  const sources = new Map();
  for (const it of items) {
    if (it.status === ITEM_STATUS.DISMISSED) continue;
    for (const k of it.matchedKeywords || []) keywords.set(k, (keywords.get(k) || 0) + 1);
    if (it.sourceDomain) sources.set(it.sourceDomain, (sources.get(it.sourceDomain) || 0) + 1);
  }
  const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }));
  return { keywords: sortDesc(keywords), sources: sortDesc(sources) };
}

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
  const all = Object.values(await getOpportunitiesMap());
  let rows = filterAndSort(all, payload);
  if (Array.isArray(payload.ids) && payload.ids.length) {
    const wanted = new Set(payload.ids);
    rows = rows.filter((it) => wanted.has(it.id));
  }
  return toCsv(rows);
}

async function testSource(id) {
  const settings = await getSettings();
  const lines = [];
  const ctx = { settings, log: (m) => lines.push(m), ...makeFetchers(settings) };
  const result = await runConnector(id, ctx);
  await setSourceHealth({ [id]: result.health });
  return { health: result.health, sample: result.items.slice(0, 5).map((it) => ({ title: it.title, deadline: it.deadline, url: it.url })), log: lines };
}

/* ── Alarms ── */

async function ensureAlarm(settings) {
  const s = settings || await getSettings();
  const periodInMinutes = Math.max(LIMITS.MIN_SCAN_INTERVAL_MINUTES, (Number(s.scanIntervalHours) || 12) * 60);
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing || existing.periodInMinutes !== periodInMinutes) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes, delayInMinutes: periodInMinutes });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  invalidateCache();
  await recoverInterruptedScan();
  await ensureAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  invalidateCache();
  await recoverInterruptedScan();
  await ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  startScan().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.os_opportunities && !scanInThisWorker) invalidateCache();
});

/* ── Messages ── */

const handlers = {
  [MSG.START_SCAN]: () => startScan(),
  [MSG.STOP_SCAN]: async () => { scanAborted = true; log("Stop requested"); return { stopping: true }; },
  [MSG.TEST_SOURCE]: (p) => testSource(String(p?.id || "")),
  [MSG.GET_DASHBOARD]: (p) => getDashboard(p || {}),
  [MSG.GET_RESULTS]: async (p) => filterAndSort(Object.values(await getOpportunitiesMap()), p || {}),
  [MSG.GET_CONNECTORS]: () => getConnectorCatalog(),
  [MSG.GET_SCAN_STATE]: () => getScanState(),
  [MSG.GET_SOURCE_HEALTH]: () => getSourceHealth(),
  [MSG.GET_SETTINGS]: () => getSettings(),
  [MSG.SAVE_SETTINGS]: async (p) => { const s = await saveSettings(p || {}); await ensureAlarm(s); return s; },
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
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

import { fetchAllConnectorItems, getConnectorCatalog } from "../lib/connectors.js";
import { scoreOpportunity } from "../lib/matcher.js";
import {
  getSettings, getSeenUrls, markUrlsSeen, setScanState,
  getOpportunitiesMap, getOpportunitiesCount, upsertOpportunities,
  updateOpportunityStatus, getScanState, clearAllData
} from "../lib/storage.js";
import { parseOpportunityPage, parseHtmlListingPage } from "../lib/parsers.js";
import { ITEM_STATUS, APP_NAME } from "../lib/types.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function hashString(v) {
  let h = 0;
  for (let i = 0; i < v.length; i++) { h = (h << 5) - h + v.charCodeAt(i); h |= 0; }
  return `opp_${Math.abs(h)}`;
}

function safeCanonicalUrl(url) {
  try { const p = new URL(url); p.hash = ""; p.searchParams.sort(); return p.toString(); }
  catch { return url; }
}

function clusterKey(title) {
  return String(title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")
    .trim().split(" ").filter((w) => w.length > 2).sort().slice(0, 6).join("-");
}

function assignClusters(items) {
  const map = new Map();
  for (const it of items) {
    const k = clusterKey(it.title);
    if (!k) continue;
    const cid = `cl_${hashString(k)}`;
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(it);
    it.clusterId = cid;
  }
  for (const g of map.values()) {
    const best = g.reduce((a, b) => ((a.score || 0) >= (b.score || 0) ? a : b));
    for (const it of g) { it.clusterSize = g.length; it.isClusterPrimary = it.id === best.id; }
  }
}

function cleanUrl(raw) {
  return raw.replace(/^[\s\u2022\u2023\u2043\u25E6\u25AA\u25AB•\-\*\t]+/, "").trim();
}

function isExpired(deadline) {
  if (!deadline) return false;
  const d = Date.parse(String(deadline));
  if (Number.isNaN(d)) return false;
  return d < Date.now();
}

async function fetchText(url, timeout = 25000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

async function fetchJson(url, timeout = 25000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).hostname}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const scanLog = [];
function log(msg) { scanLog.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

async function pooled(items, fn, n = 3) {
  let i = 0;
  async function w() {
    while (i < items.length) {
      const j = i++;
      try { await fn(items[j]); }
      catch (e) {
        let h = typeof items[j] === "string" ? items[j] : items[j]?.url || "?";
        try { h = new URL(h).hostname; } catch {}
        log(`FAIL: ${h} - ${e.message || e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
}

async function runScan() {
  scanLog.length = 0;
  log("Scan started");
  const settings = await getSettings();
  const seenUrls = await getSeenUrls();
  const tm = settings.fetchTimeoutMs || 25000;
  const cc = settings.maxConcurrentFetches || 3;

  const ctx = {
    settings, log,
    fetchText: (u) => fetchText(u, tm),
    fetchJson: (u) => fetchJson(u, tm)
  };

  let apiItems = [];
  try { apiItems = await fetchAllConnectorItems(ctx); log(`Total API items: ${apiItems.length}`); }
  catch (e) { log(`Connectors error: ${e.message}`); }

  const customUrls = (settings.customSourceUrls || []).map(cleanUrl).filter((u) => u.startsWith("http"));
  const customItems = [];
  if (customUrls.length) {
    log(`Custom source pages: ${customUrls.length}`);
    await pooled(customUrls, async (url) => {
      const html = await ctx.fetchText(url);
      customItems.push(...parseHtmlListingPage(html, url, new URL(url).hostname, "other"));
    }, cc);
    log(`Custom source items: ${customItems.length}`);
  }

  const manualLinks = (settings.manualLinks || []).map(cleanUrl).filter((u) => u.startsWith("http"));
  const manualItems = [];
  if (manualLinks.length) {
    log(`Manual links: ${manualLinks.length}`);
    await pooled(manualLinks, async (url) => {
      const html = await ctx.fetchText(url);
      manualItems.push(parseOpportunityPage(html, url));
    }, cc);
    log(`Manual items parsed: ${manualItems.length}`);
  }

  const allRaw = [...apiItems, ...customItems, ...manualItems];
  log(`Total raw items: ${allRaw.length}`);

  const result = [];
  let expiredCount = 0;
  for (const item of allRaw) {
    if (!item?.url) continue;
    if (isExpired(item.deadline)) { expiredCount++; continue; }
    const canon = safeCanonicalUrl(item.url);
    if (seenUrls[canon]) continue;
    const scored = scoreOpportunity(item, settings);
    if (scored.score >= settings.minScore) {
      scored.id = hashString(`${canon}:${scored.title}`);
      scored.canonicalUrl = canon;
      result.push(scored);
    }
  }

  log(`Expired (skipped): ${expiredCount}`);
  log(`Items stored: ${result.length}`);

  assignClusters(result);
  await upsertOpportunities(result);
  await markUrlsSeen(result.map((p) => p.canonicalUrl));

  const thr = settings.highPriorityThreshold || 80;
  const hp = result.filter((it) => it.score >= thr).slice(0, 5);
  for (const it of hp) {
    try {
      await chrome.notifications.create(`os_${it.id}`, {
        type: "basic", iconUrl: "/icons/icon128.png",
        title: `${APP_NAME} - High Priority`,
        message: `${(it.title || "").slice(0, 80)} (Score: ${it.score})`, priority: 2
      });
    } catch {}
  }

  log("Scan complete");
  const prev = await getScanState();
  await setScanState({
    isRunning: false, lastScanAt: new Date().toISOString(), lastError: null,
    lastAddedCount: result.length, totalScans: (prev.totalScans || 0) + 1,
    lastLog: scanLog.join("\n")
  });
}

function csvEsc(v) { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function toCsv(items) {
  const h = ["id","title","type","score","status","organization","location","deadline","postedDate","sourceDomain","url","matchedKeywords","summary"];
  const rows = [h.join(",")];
  for (const it of items) {
    rows.push([it.id, it.title, it.type, it.score, it.status, it.organization, it.location,
      it.deadline, it.postedDate, it.sourceDomain, it.url,
      (it.matchedKeywords||[]).join("; "), it.summary].map(csvEsc).join(","));
  }
  return rows.join("\r\n");
}

async function getFiltered(p = {}) {
  const all = Object.values(await getOpportunitiesMap());
  const min = Number(p.minScore ?? 0);
  const tf = p.typeFilter || "all";
  const sf = p.statusFilter || "all";
  return all
    .filter((it) => it.score >= min)
    .filter((it) => tf === "all" || it.type === tf)
    .filter((it) => sf === "all" || it.status === sf)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  chrome.alarms.create("scheduledScan", { periodInMinutes: Math.max(60, s.scanIntervalHours * 60) });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "scheduledScan") return;
  const st = await getScanState();
  if (st.isRunning) return;
  await setScanState({ isRunning: true, lastError: null });
  try { await runScan(); }
  catch (e) { await setScanState({ isRunning: false, lastError: String(e), lastLog: scanLog.join("\n") }); }
});

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  (async () => {
    try {
      switch (msg.type) {
        case "START_SCAN": {
          const st = await getScanState();
          if (st.isRunning) { send({ ok: false, error: "Scan already running." }); return; }
          await setScanState({ isRunning: true, lastError: null });
          runScan().catch(async (e) => { await setScanState({ isRunning: false, lastError: String(e), lastLog: scanLog.join("\n") }); });
          send({ ok: true, data: { started: true } }); return;
        }
        case "GET_RESULTS": send({ ok: true, data: await getFiltered(msg.payload) }); return;
        case "GET_CONNECTORS": send({ ok: true, data: getConnectorCatalog() }); return;
        case "GET_SCAN_STATE": send({ ok: true, data: await getScanState() }); return;
        case "GET_COUNTS": send({ ok: true, data: await getOpportunitiesCount() }); return;
        case "EXPORT_CSV": send({ ok: true, data: toCsv(await getFiltered(msg.payload || {})) }); return;
        case "SAVE_ITEM": await updateOpportunityStatus(msg.payload.id, ITEM_STATUS.SAVED); send({ ok: true }); return;
        case "DISMISS_ITEM": await updateOpportunityStatus(msg.payload.id, ITEM_STATUS.DISMISSED); send({ ok: true }); return;
        case "CLEAR_DATA": await clearAllData(); send({ ok: true }); return;
        default: send({ ok: false, error: "Unknown message type." });
      }
    } catch (e) { send({ ok: false, error: String(e) }); }
  })();
  return true;
});

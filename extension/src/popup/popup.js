import { api, onScanProgress } from "./api.js";
import { renderList, buildEmptyState, updateCard } from "./render.js";
import { showToast, hideToast } from "./toast.js";
import { fmtElapsed, relativeTime, plural } from "./format.js";
import { SCAN_PHASES } from "../lib/types.js";

const $ = (id) => document.getElementById(id);
const els = {
  app: $("app"), scanBtn: $("scanBtn"), stopBtn: $("stopBtn"), scanPanel: $("scanPanel"), scanText: $("scanText"),
  scanElapsed: $("scanElapsed"), scanBar: $("scanBar"), scanRunning: $("scanRunning"),
  banner: $("banner"), bannerText: $("bannerText"), bannerAction: $("bannerAction"),
  search: $("searchBox"), statusSeg: $("statusSeg"), typeFilter: $("typeFilter"), sortBy: $("sortBy"),
  minScore: $("minScore"), minScoreValue: $("minScoreValue"), moreFilters: $("moreFilters"), extraFilters: $("extraFilters"),
  keywordFilter: $("keywordFilter"), sourceFilter: $("sourceFilter"), resetFilters: $("resetFilters"),
  selectAll: $("selectAll"), resultCount: $("resultCount"), lastScan: $("lastScan"), results: $("results"),
  bulkBar: $("bulkBar"), bulkCount: $("bulkCount"), bulkSave: $("bulkSave"), bulkDismiss: $("bulkDismiss"), bulkExport: $("bulkExport"), bulkClear: $("bulkClear"),
  themeToggle: $("themeToggle"), densityToggle: $("densityToggle"), settingsBtn: $("settingsBtn"), healthLink: $("healthLink"),
  version: $("version"), brandSub: $("brandSub"), onboarding: $("onboarding"), dismissOnboarding: $("dismissOnboarding")
};

const PREF_KEYS = ["os_theme", "os_density", "os_onboarded", "os_filters"];
const state = {
  params: { statusFilter: "all", typeFilter: "all", sortBy: "score", minScore: 0, keywordFilter: "all", sourceFilter: "all", searchQuery: "" },
  items: [], counts: { total: 0, new: 0, saved: 0, dismissed: 0 }, facets: { keywords: [], sources: [] },
  scanState: null, health: {},
  selectedIds: new Set(), focusedId: null,
  scanning: false, scanStartedAt: null, elapsedTimer: null, pollTimer: null, idleTimer: null,
  hasEverScanned: false
};

/* ── Preferences ── */
async function loadPrefs() {
  const prefs = await chrome.storage.local.get(PREF_KEYS);
  const theme = prefs.os_theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  els.results.dataset.density = prefs.os_density || "comfortable";
  if (prefs.os_filters) Object.assign(state.params, prefs.os_filters);
  return prefs;
}
function persistFilters() { chrome.storage.local.set({ os_filters: state.params }).catch(() => {}); }

els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  chrome.storage.local.set({ os_theme: next });
});
els.densityToggle.addEventListener("click", () => {
  const next = els.results.dataset.density === "compact" ? "comfortable" : "compact";
  els.results.dataset.density = next;
  chrome.storage.local.set({ os_density: next });
});
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.healthLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.dismissOnboarding.addEventListener("click", async () => {
  els.onboarding.hidden = true;
  await chrome.storage.local.set({ os_onboarded: true });
  startScan();
});

/* ── Filters ── */
function syncFilterControls() {
  const p = state.params;
  els.search.value = p.searchQuery || "";
  els.typeFilter.value = p.typeFilter;
  els.sortBy.value = p.sortBy;
  els.minScore.value = String(p.minScore);
  els.minScoreValue.value = String(p.minScore);
  for (const b of els.statusSeg.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.status === p.statusFilter));
  const extraActive = p.keywordFilter !== "all" || p.sourceFilter !== "all";
  if (extraActive) { els.extraFilters.hidden = false; els.moreFilters.setAttribute("aria-expanded", "true"); }
  els.moreFilters.textContent = extraActive ? "More ·" : "More";
}

function fillSelect(select, options, current, allLabel) {
  select.replaceChildren();
  const all = document.createElement("option"); all.value = "all"; all.textContent = allLabel; select.appendChild(all);
  for (const { value, count } of options) {
    const o = document.createElement("option"); o.value = value; o.textContent = `${value} (${count})`; select.appendChild(o);
  }
  select.value = options.some((o) => o.value === current) ? current : "all";
}

let searchTimer = null;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.params.searchQuery = els.search.value.trim(); refresh(); }, 180);
});
els.minScore.addEventListener("input", () => { els.minScoreValue.value = els.minScore.value; });
els.minScore.addEventListener("change", () => { state.params.minScore = Number(els.minScore.value); refresh(); });
els.typeFilter.addEventListener("change", () => { state.params.typeFilter = els.typeFilter.value; refresh(); });
els.sortBy.addEventListener("change", () => { state.params.sortBy = els.sortBy.value; refresh(); });
els.keywordFilter.addEventListener("change", () => { state.params.keywordFilter = els.keywordFilter.value; refresh(); });
els.sourceFilter.addEventListener("change", () => { state.params.sourceFilter = els.sourceFilter.value; refresh(); });
els.statusSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-status]");
  if (!b) return;
  state.params.statusFilter = b.dataset.status;
  state.selectedIds.clear();
  refresh();
});
els.moreFilters.addEventListener("click", () => {
  const open = els.extraFilters.hidden;
  els.extraFilters.hidden = !open;
  els.moreFilters.setAttribute("aria-expanded", String(open));
});
els.resetFilters.addEventListener("click", () => {
  Object.assign(state.params, { statusFilter: "all", typeFilter: "all", minScore: 0, keywordFilter: "all", sourceFilter: "all", searchQuery: "" });
  refresh();
});

/* ── Data ── */
async function refresh({ keepFocus = true } = {}) {
  persistFilters();
  let data;
  try { data = await api.dashboard(state.params); }
  catch (e) { showBanner(`Could not load results: ${e.message}`, "is-danger"); return; }
  state.items = data.items;
  state.counts = data.counts;
  state.facets = data.facets;
  state.health = data.health || {};
  state.scanState = data.state;
  state.hasEverScanned = Boolean(data.state?.lastScanAt) || data.counts.total > 0;
  const visible = new Set(state.items.map((i) => i.id));
  for (const id of state.selectedIds) if (!visible.has(id)) state.selectedIds.delete(id);
  if (!keepFocus || !visible.has(state.focusedId)) state.focusedId = null;
  syncFilterControls();
  fillSelect(els.keywordFilter, state.facets.keywords, state.params.keywordFilter, "Any keyword");
  fillSelect(els.sourceFilter, state.facets.sources, state.params.sourceFilter, "All sources");
  renderCounts();
  renderResults();
  renderScanMeta();
  if (data.state?.isRunning && !state.scanning) enterScanningUi(data.state);
}

function renderCounts() {
  const c = state.counts;
  const set = (k, v) => { const el = els.statusSeg.querySelector(`[data-count="${k}"]`); if (el) el.textContent = String(v); };
  set("active", c.total - c.dismissed); set("new", c.new); set("saved", c.saved); set("dismissed", c.dismissed);
  els.brandSub.textContent = `Afghanistan · ${plural(Object.keys(state.health).length || 0, "source")} · ${plural(c.total, "notice")}`;
  const errors = Object.values(state.health).filter((h) => h.status === "error").length;
  els.healthLink.textContent = errors ? `Sources · ${errors} failing` : "Sources";
  els.healthLink.classList.toggle("has-errors", errors > 0);
}

function hasActiveFilters() {
  const p = state.params;
  return p.typeFilter !== "all" || p.minScore > 0 || p.keywordFilter !== "all" || p.sourceFilter !== "all" || Boolean(p.searchQuery) || p.statusFilter !== "all";
}

function renderResults() {
  const n = state.items.length;
  els.resultCount.textContent = plural(n, "result");
  if (!n) {
    els.results.replaceChildren(
      !state.hasEverScanned
        ? buildEmptyState({ title: "Nothing scanned yet", hint: "Pull the latest notices from ACBAR, UNGM, the World Bank, Afghan Tenders and more.", actions: [{ label: "Scan now", primary: true, onClick: startScan }] })
        : hasActiveFilters()
          ? buildEmptyState({ title: "No matches", hint: "Nothing fits these filters. Widen the search or lower the minimum score.", actions: [{ label: "Reset filters", onClick: () => els.resetFilters.click() }] })
          : buildEmptyState({ title: "Inbox zero", hint: "Every notice has been triaged. Run a scan to look for new ones.", actions: [{ label: "Scan now", primary: true, onClick: startScan }] })
    );
  } else {
    renderList(els.results, state.items, { selectedIds: state.selectedIds, focusedId: state.focusedId });
  }
  updateBulkBar();
}

function renderScanMeta() {
  const st = state.scanState;
  if (!st) return;
  if (st.lastError && !st.isRunning) {
    els.lastScan.textContent = "Last scan failed";
    els.lastScan.classList.add("is-error");
    els.lastScan.title = st.lastError;
  } else {
    els.lastScan.classList.remove("is-error");
    els.lastScan.textContent = st.lastScanAt ? `Scanned ${relativeTime(st.lastScanAt)} · ${st.lastAddedCount || 0} new` : "";
    els.lastScan.title = st.lastScanAt ? new Date(st.lastScanAt).toLocaleString() : "";
  }
}

/* ── Banner ── */
let bannerTimer = null;
function showBanner(text, cls = "", { actionLabel, onAction, timeout } = {}) {
  clearTimeout(bannerTimer);
  els.bannerText.textContent = text;
  els.banner.className = `banner ${cls}`.trim();
  els.bannerAction.hidden = !onAction;
  els.bannerAction.textContent = actionLabel || "";
  els.bannerAction.onclick = onAction || null;
  els.banner.hidden = false;
  if (timeout) bannerTimer = setTimeout(hideBanner, timeout);
}
function hideBanner() { els.banner.hidden = true; }
window.addEventListener("offline", () => showBanner("You are offline. Scans will fail until the connection is back.", "is-danger"));
window.addEventListener("online", () => showBanner("Back online.", "is-ok", { timeout: 2500 }));

/* ── Scanning ── */
function enterScanningUi(st) {
  state.scanning = true;
  state.scanStartedAt = st?.startedAt ? Date.parse(st.startedAt) : Date.now();
  els.scanPanel.hidden = false;
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = "Scanning";
  els.stopBtn.disabled = false;
  els.stopBtn.textContent = "Stop";
  applyProgress(st?.progress || { phase: SCAN_PHASES.CONNECTORS, done: 0, total: 0 });
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = setInterval(() => { els.scanElapsed.textContent = fmtElapsed(Date.now() - state.scanStartedAt); }, 1000);
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(pollScanState, 1500);
  armIdleWatchdog();
}

function exitScanningUi() {
  state.scanning = false;
  clearInterval(state.elapsedTimer); clearInterval(state.pollTimer); clearTimeout(state.idleTimer);
  els.scanPanel.hidden = true;
  els.scanBtn.disabled = false;
  els.scanBtn.textContent = "Scan";
}

function armIdleWatchdog() {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(async () => {
    const st = await api.scanState().catch(() => null);
    if (st?.isRunning) { els.scanText.textContent = "Still working… a slow source is holding things up"; armIdleWatchdog(); }
  }, 45000);
}

function applyProgress(p) {
  armIdleWatchdog();
  const total = Number(p.total) || 0;
  const done = Number(p.done) || 0;
  const determinate = p.phase === SCAN_PHASES.CONNECTORS && total > 0;
  els.scanBar.classList.toggle("indeterminate", !determinate);
  els.scanBar.style.width = determinate ? `${Math.round((done / total) * 100)}%` : "";
  const found = p.items != null ? ` · ${p.items} fetched` : "";
  switch (p.phase) {
    case SCAN_PHASES.CONNECTORS: els.scanText.textContent = total ? `Fetching sources ${done}/${total}${found}` : "Starting sources…"; break;
    case SCAN_PHASES.CUSTOM_SOURCES: els.scanText.textContent = "Crawling your custom source pages…"; break;
    case SCAN_PHASES.MANUAL_LINKS: els.scanText.textContent = "Reading your manual links…"; break;
    case SCAN_PHASES.SCORING: els.scanText.textContent = `Scoring ${p.items || 0} notices…`; break;
    case SCAN_PHASES.SAVING: els.scanText.textContent = "Saving results…"; break;
    default: els.scanText.textContent = "Working…";
  }
  els.scanRunning.replaceChildren();
  if (p.running?.length) {
    const b = document.createElement("b"); b.textContent = "Now: ";
    els.scanRunning.append(b, p.running.map(labelFor).join(", "));
  } else if (p.lastSource) {
    const b = document.createElement("b"); b.textContent = p.lastSource;
    const h = p.lastHealth;
    els.scanRunning.append(b, ` · ${h?.status === "error" ? `failed: ${h.error}` : plural(h?.count || 0, "item")}`);
  }
}

const labelCache = new Map();
function labelFor(id) { return labelCache.get(id) || id; }

async function startScan() {
  if (state.scanning) return;
  hideBanner();
  try {
    const res = await api.startScan();
    if (!res.started) { showBanner(res.reason || "Scan already running", "", { timeout: 3000 }); return; }
    enterScanningUi({ startedAt: new Date().toISOString() });
  } catch (e) {
    showBanner(`Could not start scan: ${e.message}`, "is-danger");
  }
}
els.scanBtn.addEventListener("click", startScan);
els.stopBtn.addEventListener("click", async () => {
  els.stopBtn.disabled = true;
  els.stopBtn.textContent = "Stopping…";
  await api.stopScan().catch(() => {});
});

async function pollScanState() {
  const st = await api.scanState().catch(() => null);
  if (!st) return;
  if (st.isRunning) { if (st.progress) applyProgress(st.progress); return; }
  await finishScan(st.progress || { phase: st.lastError ? SCAN_PHASES.FAILED : SCAN_PHASES.COMPLETE, items: st.lastAddedCount, error: st.lastError });
}

async function finishScan(p) {
  if (!state.scanning) return;
  exitScanningUi();
  await refresh({ keepFocus: false });
  const errors = Object.values(state.health).filter((h) => h.status === "error").length;
  if (p.phase === SCAN_PHASES.FAILED) showBanner(`Scan failed: ${p.error || state.scanState?.lastError || "unknown error"}`, "is-danger");
  else {
    const n = p.items ?? state.scanState?.lastAddedCount ?? 0;
    const text = p.phase === SCAN_PHASES.STOPPED ? `Stopped · ${plural(n, "new notice")} saved` : n ? `${plural(n, "new notice")} found` : "No new notices since last scan";
    if (errors) showBanner(`${text} · ${plural(errors, "source")} failed`, "", { actionLabel: "Details", onAction: () => chrome.runtime.openOptionsPage(), timeout: 8000 });
    else showToast(text, { duration: 3500 });
  }
}

onScanProgress((p) => {
  if (p.phase === SCAN_PHASES.COMPLETE || p.phase === SCAN_PHASES.STOPPED || p.phase === SCAN_PHASES.FAILED) { finishScan(p); return; }
  if (!state.scanning) enterScanningUi({ startedAt: new Date(Date.now()).toISOString(), progress: p });
  else applyProgress(p);
});

/* ── Item actions ── */
function itemById(id) { return state.items.find((i) => i.id === id); }
function cardById(id) { return els.results.querySelector(`.card[data-id="${CSS.escape(id)}"]`); }

async function changeStatus(id, status, { announce = true } = {}) {
  const item = itemById(id);
  if (!item) return;
  const previous = item.status;
  const leaves = state.params.statusFilter !== "all" ? status !== state.params.statusFilter : status === "dismissed";
  item.status = status;
  const card = cardById(id);
  if (card) {
    updateCard(card, item);
    if (leaves) { card.classList.add("is-leaving"); setTimeout(() => { if (item.status === status) { card.remove(); if (!els.results.querySelector(".card")) renderResults(); } }, 220); }
  }
  bumpCounts(previous, status);
  try { await api.setStatus(id, status); }
  catch (e) { item.status = previous; showBanner(`Could not update: ${e.message}`, "is-danger"); await refresh(); return; }
  if (announce) {
    const verb = status === "saved" ? "Saved" : status === "dismissed" ? "Dismissed" : "Restored";
    showToast(`${verb} “${(item.title || "").slice(0, 48)}${item.title?.length > 48 ? "…" : ""}”`, {
      actionLabel: "Undo", onAction: async () => { await api.setStatus(id, previous); await refresh(); }
    });
  }
}

function bumpCounts(from, to) {
  if (from === to) return;
  if (from in state.counts) state.counts[from]--;
  if (to in state.counts) state.counts[to]++;
  renderCounts();
}

els.results.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.classList.contains("card-check")) {
    if (e.target.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
    card.classList.toggle("is-selected", e.target.checked);
    updateBulkBar();
    return;
  }
  if (!btn) { setFocused(id, { scroll: false }); return; }
  const item = itemById(id);
  switch (btn.dataset.action) {
    case "save": await changeStatus(id, item?.status === "saved" ? "new" : "saved"); break;
    case "dismiss": await changeStatus(id, item?.status === "dismissed" ? "new" : "dismissed"); break;
    case "note": { const wrap = card.querySelector(".card-note"); wrap.hidden = false; wrap.querySelector("input").focus(); break; }
    case "copy": {
      try { await navigator.clipboard.writeText(card.dataset.url); btn.textContent = "Copied"; btn.classList.add("is-flash"); setTimeout(() => { btn.textContent = "Copy link"; btn.classList.remove("is-flash"); }, 1200); }
      catch { showBanner("Clipboard blocked by the browser", "is-danger", { timeout: 2500 }); }
      break;
    }
  }
});

els.results.addEventListener("focusout", async (e) => {
  if (!e.target.classList.contains("note-input")) return;
  const card = e.target.closest(".card");
  const item = itemById(card.dataset.id);
  const notes = e.target.value.trim();
  if (!item || notes === (item.notes || "")) { if (!notes) card.querySelector(".card-note").hidden = true; return; }
  item.notes = notes;
  card.classList.toggle("has-note", Boolean(notes));
  try { await api.saveNote(item.id, notes); } catch (err) { showBanner(`Note not saved: ${err.message}`, "is-danger"); }
});

/* ── Bulk ── */
function updateBulkBar() {
  const n = state.selectedIds.size;
  els.bulkBar.hidden = n === 0;
  els.bulkCount.textContent = `${n} selected`;
  els.selectAll.checked = n > 0 && n === state.items.length;
  els.selectAll.indeterminate = n > 0 && n < state.items.length;
  if (n) hideToast();
}
els.selectAll.addEventListener("change", () => {
  state.selectedIds = els.selectAll.checked ? new Set(state.items.map((i) => i.id)) : new Set();
  for (const card of els.results.querySelectorAll(".card")) {
    const on = state.selectedIds.has(card.dataset.id);
    card.querySelector(".card-check").checked = on;
    card.classList.toggle("is-selected", on);
  }
  updateBulkBar();
});
els.bulkClear.addEventListener("click", () => { state.selectedIds.clear(); renderResults(); });

async function bulkStatus(status) {
  const ids = [...state.selectedIds];
  if (!ids.length) return;
  state.selectedIds.clear();
  try {
    const { previous } = await api.bulkUpdate(ids, status);
    await refresh();
    showToast(`${status === "saved" ? "Saved" : "Dismissed"} ${plural(ids.length, "notice")}`, {
      actionLabel: "Undo", onAction: async () => { await api.restore(previous); await refresh(); }
    });
  } catch (e) { showBanner(`Bulk update failed: ${e.message}`, "is-danger"); }
}
els.bulkSave.addEventListener("click", () => bulkStatus("saved"));
els.bulkDismiss.addEventListener("click", () => bulkStatus("dismissed"));
els.bulkExport.addEventListener("click", () => exportCsv([...state.selectedIds]));

async function exportCsv(ids = null) {
  try {
    const csv = await api.exportCsv({ ...state.params, ids });
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${plural(ids ? ids.length : state.items.length, "row")}`, { duration: 2500 });
  } catch (e) { showBanner(`Export failed: ${e.message}`, "is-danger"); }
}

/* ── Keyboard ── */
function setFocused(id, { scroll = true } = {}) {
  state.focusedId = id;
  for (const card of els.results.querySelectorAll(".card")) {
    const on = card.dataset.id === id;
    card.classList.toggle("is-focused", on);
    if (on && scroll) card.scrollIntoView({ block: "nearest" });
  }
}
function moveFocus(delta) {
  if (!state.items.length) return;
  const idx = state.items.findIndex((i) => i.id === state.focusedId);
  const next = idx === -1 ? (delta > 0 ? 0 : state.items.length - 1) : Math.max(0, Math.min(state.items.length - 1, idx + delta));
  setFocused(state.items[next].id);
}
document.addEventListener("keydown", async (e) => {
  const typing = /^(input|select|textarea)$/i.test(e.target.tagName);
  if (e.key === "Escape") {
    if (typing) { e.target.blur(); if (e.target === els.search && els.search.value) { els.search.value = ""; state.params.searchQuery = ""; refresh(); } }
    else if (state.selectedIds.size) { state.selectedIds.clear(); renderResults(); }
    else hideToast();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const focused = state.focusedId && itemById(state.focusedId);
  switch (e.key) {
    case "/": e.preventDefault(); els.search.focus(); els.search.select(); break;
    case "j": case "ArrowDown": e.preventDefault(); moveFocus(1); break;
    case "k": case "ArrowUp": e.preventDefault(); moveFocus(-1); break;
    case "s": if (focused) await changeStatus(focused.id, focused.status === "saved" ? "new" : "saved"); break;
    case "d": if (focused) { const id = focused.id; moveFocus(1); await changeStatus(id, focused.status === "dismissed" ? "new" : "dismissed"); } break;
    case "o": case "Enter": if (focused?.url) chrome.tabs.create({ url: focused.url }); break;
    case "x": if (focused) { const card = cardById(focused.id); card?.querySelector(".card-check").click(); } break;
    case "r": if (!state.scanning) startScan(); break;
    case "e": exportCsv(state.selectedIds.size ? [...state.selectedIds] : null); break;
  }
});

/* ── Init ── */
(async () => {
  els.version.textContent = `v${chrome.runtime.getManifest().version}`;
  const prefs = await loadPrefs();
  if (!navigator.onLine) showBanner("You are offline. Scans will fail until the connection is back.", "is-danger");
  try {
    const catalog = await chrome.runtime.sendMessage({ type: "GET_CONNECTORS" });
    for (const c of catalog?.data || []) labelCache.set(c.id, c.label.split(" — ")[0]);
  } catch { /* labels are cosmetic */ }
  await refresh();
  if (!prefs.os_onboarded && !state.hasEverScanned) els.onboarding.hidden = false;
})();

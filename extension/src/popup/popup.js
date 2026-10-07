import { api, onScanProgress } from "./api.js";
import { hideToast } from "./toast.js";
import { showBanner } from "./banner.js";
import { DEFAULT_PARAMS, applyDashboard, sanitizeFilters } from "./state.js";
import { syncFilterControls, fillSelect, bindFilters } from "./filters.js";
import * as view from "./view.js";
import * as scanUi from "./scan-ui.js";
import * as actions from "./item-actions.js";
import { bindKeyboard } from "./keyboard.js";
import { bindResultEvents } from "./result-events.js";
import { initTheme, bindThemeToggle } from "../ui/theme.js";
import { loadPrefs, savePref } from "../ui/prefs.js";
import { ITEM_STATUS, PREF_KEYS } from "../lib/types.js";

const ONLINE_BANNER_MS = 2500;
const OFFLINE_TEXT = "You are offline. Scans will fail until the connection is back.";
const DENSITY = Object.freeze({ COMFORTABLE: "comfortable", COMPACT: "compact" });

const $ = (id) => document.getElementById(id);
const els = {
  scanBtn: $("scanBtn"), stopBtn: $("stopBtn"), scanPanel: $("scanPanel"), scanText: $("scanText"),
  scanElapsed: $("scanElapsed"), scanBar: $("scanBar"), scanRunning: $("scanRunning"),
  search: $("searchBox"), statusSeg: $("statusSeg"), typeFilter: $("typeFilter"), sortBy: $("sortBy"),
  minScore: $("minScore"), minScoreValue: $("minScoreValue"), moreFilters: $("moreFilters"), extraFilters: $("extraFilters"),
  keywordFilter: $("keywordFilter"), sourceFilter: $("sourceFilter"), showClosed: $("showClosed"), resetFilters: $("resetFilters"),
  selectAll: $("selectAll"), resultCount: $("resultCount"), lastScan: $("lastScan"), results: $("results"),
  bulkBar: $("bulkBar"), bulkCount: $("bulkCount"), bulkSave: $("bulkSave"), bulkDismiss: $("bulkDismiss"), bulkExport: $("bulkExport"), bulkClear: $("bulkClear"),
  themeToggle: $("themeToggle"), densityToggle: $("densityToggle"), settingsBtn: $("settingsBtn"), healthLink: $("healthLink"),
  version: $("version"), brandSub: $("brandSub"), onboarding: $("onboarding"), dismissOnboarding: $("dismissOnboarding")
};

let state = {
  params: { ...DEFAULT_PARAMS }, items: [], counts: { total: 0, new: 0, saved: 0, dismissed: 0 }, facets: { keywords: [], sources: [] },
  scanState: null, health: {}, selectedIds: new Set(), focusedId: null, hasEverScanned: false
};
const getState = () => state;
function setState(patch) { state = { ...state, ...patch }; }

let labels = new Map();
const labelFor = (id) => labels.get(id) || id;
const reportPrefError = (e) => showBanner(`Could not save preference: ${e.message}`, { tone: "danger" });

/* ── Data ── */
let refreshSeq = 0;
async function refresh({ keepFocus = true } = {}) {
  const seq = ++refreshSeq;
  let data;
  try { data = await api.dashboard(state.params); }
  catch (e) { if (seq === refreshSeq) showBanner(`Could not load results: ${e.message}`, { tone: "danger" }); return; }
  if (seq !== refreshSeq) return; // a newer request superseded this one
  setState(applyDashboard(state, data, { keepFocus }));
  syncFilterControls(els, state.params);
  fillSelect(els.keywordFilter, state.facets.keywords, state.params.keywordFilter, "Any keyword");
  fillSelect(els.sourceFilter, state.facets.sources, state.params.sourceFilter, "All sources");
  view.renderCounts();
  view.renderResults();
  view.renderScanMeta();
  if (data.state?.isRunning && !scanUi.isScanning()) scanUi.enterScanningUi(data.state);
}

function updateParams(patch, { clearSelection = false } = {}) {
  setState({ params: { ...state.params, ...patch }, ...(clearSelection ? { selectedIds: new Set() } : {}) });
  savePref(PREF_KEYS.FILTERS, state.params, { onError: reportPrefError });
  refresh();
}

view.initView({ els, getState, setState, emptyActions: { scan: () => scanUi.startScan(), resetFilters: () => els.resetFilters.click() } });
scanUi.initScanUi({ els, api, refresh, getState, labelFor });
actions.initItemActions({ api, getState, setState, refresh });

/* ── Listeners ── */
bindFilters({ els, getParams: () => state.params, onChange: updateParams });
bindThemeToggle(els.themeToggle, { onError: reportPrefError });
els.densityToggle.addEventListener("click", () => {
  const next = els.results.dataset.density === DENSITY.COMPACT ? DENSITY.COMFORTABLE : DENSITY.COMPACT;
  els.results.dataset.density = next;
  savePref(PREF_KEYS.DENSITY, next, { onError: reportPrefError });
});
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.healthLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.dismissOnboarding.addEventListener("click", async () => {
  els.onboarding.hidden = true;
  await savePref(PREF_KEYS.ONBOARDED, true, { onError: reportPrefError });
  scanUi.startScan();
});
els.scanBtn.addEventListener("click", () => scanUi.startScan());
els.stopBtn.addEventListener("click", () => scanUi.stopScan());
window.addEventListener("offline", () => showBanner(OFFLINE_TEXT, { tone: "danger" }));
window.addEventListener("online", () => showBanner("Back online.", { tone: "ok", timeout: ONLINE_BANNER_MS }));
onScanProgress((p) => scanUi.handleScanProgress(p));

bindResultEvents({ els, getState });

const focusedItem = () => (state.focusedId ? state.items.find((i) => i.id === state.focusedId) : null);
bindKeyboard({
  els, getState,
  actions: {
    focusSearch: () => { els.search.focus(); els.search.select(); },
    next: () => view.moveFocus(1),
    prev: () => view.moveFocus(-1),
    save: () => { const it = focusedItem(); if (it) actions.changeStatus(it.id, ITEM_STATUS.SAVED); },
    dismiss: () => { const it = focusedItem(); if (it) { view.moveFocus(1); actions.changeStatus(it.id, ITEM_STATUS.DISMISSED); } },
    open: () => { const it = focusedItem(); if (it?.url) chrome.tabs.create({ url: it.url }); },
    select: () => { const it = focusedItem(); if (it) view.cardById(it.id)?.querySelector(".card-check").click(); },
    scan: () => scanUi.startScan(),
    export: () => actions.exportCsv(state.selectedIds.size ? [...state.selectedIds] : null),
    clearSearch: () => { els.search.value = ""; updateParams({ searchQuery: "" }); },
    clearSelection: () => view.setSelection(new Set()),
    hideToast
  }
});

/* ── Init ── */
async function loadLabels() {
  try {
    const catalog = await api.connectors();
    labels = new Map(catalog.map((c) => [c.id, c.label.split(" — ")[0]]));
  } catch {
    // Labels are cosmetic (progress shows raw ids instead); never block the popup on them.
  }
}

async function init() {
  els.version.textContent = `v${chrome.runtime.getManifest().version}`;
  await initTheme();
  const prefs = await loadPrefs([PREF_KEYS.DENSITY, PREF_KEYS.ONBOARDED, PREF_KEYS.FILTERS]);
  els.results.dataset.density = prefs[PREF_KEYS.DENSITY] || DENSITY.COMFORTABLE;
  setState({ params: sanitizeFilters(prefs[PREF_KEYS.FILTERS]) });
  if (!navigator.onLine) showBanner(OFFLINE_TEXT, { tone: "danger" });
  await loadLabels();
  await refresh();
  if (!prefs[PREF_KEYS.ONBOARDED] && !state.hasEverScanned) els.onboarding.hidden = false;
}

init().catch((e) => showBanner(`Could not open the popup: ${e.message}`, { tone: "danger" }));

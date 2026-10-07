import { MSG, DEFAULT_SETTINGS } from "../lib/types.js";
import { sanitizeUrlList, rejectedUrls, originPattern } from "../lib/urls.js";
import { normalizeSettingsPatch } from "../lib/settings.js";
import { send } from "../ui/messaging.js";
import { initTheme, bindThemeToggle } from "../ui/theme.js";
import { plural, fmtSeconds } from "../ui/format.js";
import { healthBadgeView } from "./health-view.js";

const MS_PER_SECOND = 1000;
const MAX_REJECTED_SHOWN = 3;
const SAMPLE_TITLE_MAX = 90;

const $ = (id) => document.getElementById(id);
const els = {
  version: $("version"), scanNow: $("scanNow"), themeToggle: $("themeToggle"),
  reliefwebAppName: $("reliefwebAppName"), sourceList: $("sourceList"),
  customKeywords: $("customKeywords"), targetGeographies: $("targetGeographies"), minScore: $("minScore"),
  highPriorityThreshold: $("highPriorityThreshold"), notificationsEnabled: $("notificationsEnabled"),
  customSourceUrls: $("customSourceUrls"), customSourceUrlsHint: $("customSourceUrlsHint"),
  manualLinks: $("manualLinks"), manualLinksHint: $("manualLinksHint"),
  scanIntervalHours: $("scanIntervalHours"), fetchTimeoutSec: $("fetchTimeoutSec"), maxConcurrentFetches: $("maxConcurrentFetches"),
  clearBtn: $("clearBtn"), dataSummary: $("dataSummary"), saveBtn: $("saveBtn"), saveStatus: $("saveStatus")
};
const rowTemplate = $("sourceRowTemplate");
let catalog = [];
let health = {};
let dirty = false;

/* ── Helpers ── */
const lines = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
const secondsToMs = (value) => (String(value).trim() === "" ? null : Number(value) * MS_PER_SECOND);
function setStatus(text, cls = "") { els.saveStatus.textContent = text; els.saveStatus.className = `save-status ${cls}`.trim(); }
function markDirty() { if (!dirty) { dirty = true; setStatus("Unsaved changes", "is-dirty"); } }

bindThemeToggle(els.themeToggle, { onError: (e) => setStatus(`Could not save theme: ${e.message}`, "is-err") });

/* ── Sources ── */
function applyHealthBadge(el, id, settings) {
  const view = healthBadgeView(health[id], catalog.find((x) => x.id === id), settings);
  el.className = view.cls;
  el.textContent = view.text;
  el.title = view.title;
}

function groupHeading(group) {
  const heading = document.createElement("li");
  heading.className = "source-group";
  heading.textContent = group;
  return heading;
}

function buildSourceRow(c, enabled, settings) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.id = c.id;
  const check = row.querySelector(".source-check");
  check.checked = enabled.has(c.id);
  row.classList.toggle("is-off", !check.checked);
  check.addEventListener("change", () => { row.classList.toggle("is-off", !check.checked); markDirty(); });
  row.querySelector(".source-label").textContent = c.label;
  row.querySelector(".source-desc").textContent = c.description;
  const home = row.querySelector(".source-home");
  home.href = c.homepage; home.textContent = new URL(c.homepage).hostname.replace(/^www\./, "");
  applyHealthBadge(row.querySelector(".health"), c.id, settings);
  const result = row.querySelector(".source-result");
  if (health[c.id]?.status === "error") { result.textContent = health[c.id].error; result.className = "source-result is-err"; }
  row.querySelector(".source-test").addEventListener("click", () => testSource(c.id, row));
  return row;
}

function renderSources(settings) {
  const enabled = new Set(settings.enabledSources || []);
  const nodes = [];
  let lastGroup = null;
  for (const c of catalog) {
    if (c.group !== lastGroup) { nodes.push(groupHeading(c.group)); lastGroup = c.group; }
    nodes.push(buildSourceRow(c, enabled, settings));
  }
  els.sourceList.replaceChildren(...nodes);
  els.sourceList.setAttribute("aria-busy", "false");
}

function showTestResult(result, data) {
  if (data.health.status === "error") { result.className = "source-result is-err"; result.textContent = data.health.error; return; }
  result.className = "source-result is-ok";
  result.textContent = data.health.count
    ? `Fetched ${plural(data.health.count, "item")} in ${fmtSeconds(data.health.ms)}. Latest:`
    : "Reachable, but no items were found on the page (layout may have changed).";
  if (!data.sample.length) return;
  const ul = document.createElement("ul");
  for (const s of data.sample) { const li = document.createElement("li"); li.textContent = s.title.slice(0, SAMPLE_TITLE_MAX); ul.appendChild(li); }
  result.appendChild(ul);
}

async function testSource(id, row) {
  const btn = row.querySelector(".source-test");
  const result = row.querySelector(".source-result");
  btn.disabled = true; btn.textContent = "Testing…";
  result.className = "source-result"; result.textContent = "";
  try {
    if (dirty) await saveSettings({ quiet: true });
    const data = await send(MSG.TEST_SOURCE, { id });
    health = { ...health, [id]: data.health };
    applyHealthBadge(row.querySelector(".health"), id, collect());
    showTestResult(result, data);
  } catch (e) { result.className = "source-result is-err"; result.textContent = e.message; }
  finally { btn.disabled = false; btn.textContent = "Test"; }
}

/* ── Validation ── */
function validateUrlField(textarea, hint) {
  const bad = rejectedUrls(lines(textarea.value));
  const shown = `${bad.slice(0, MAX_REJECTED_SHOWN).join(", ")}${bad.length > MAX_REJECTED_SHOWN ? "…" : ""}`;
  hint.textContent = bad.length ? `Ignored ${plural(bad.length, "line")} (must be https:// public URLs): ${shown}` : "";
  hint.className = bad.length ? "hint is-warn" : "hint";
}
els.customSourceUrls.addEventListener("input", () => validateUrlField(els.customSourceUrls, els.customSourceUrlsHint));
els.manualLinks.addEventListener("input", () => validateUrlField(els.manualLinks, els.manualLinksHint));

/* ── Load / save ── */
function fillForm(settings) {
  els.reliefwebAppName.value = settings.reliefwebAppName || "";
  els.customKeywords.value = (settings.customKeywords || []).join("\n");
  els.targetGeographies.value = (settings.targetGeographies || []).join(", ");
  els.minScore.value = settings.minScore;
  els.highPriorityThreshold.value = settings.highPriorityThreshold;
  els.notificationsEnabled.checked = settings.notificationsEnabled !== false;
  els.customSourceUrls.value = (settings.customSourceUrls || []).join("\n");
  els.manualLinks.value = (settings.manualLinks || []).join("\n");
  els.scanIntervalHours.value = settings.scanIntervalHours;
  els.fetchTimeoutSec.value = Math.round((settings.fetchTimeoutMs || DEFAULT_SETTINGS.fetchTimeoutMs) / MS_PER_SECOND);
  els.maxConcurrentFetches.value = settings.maxConcurrentFetches;
}

async function load() {
  els.version.textContent = `v${chrome.runtime.getManifest().version}`;
  await initTheme();
  const [settings, connectors, h, dashboard] = await Promise.all([
    send(MSG.GET_SETTINGS), send(MSG.GET_CONNECTORS), send(MSG.GET_SOURCE_HEALTH),
    send(MSG.GET_DASHBOARD, { statusFilter: "all" }).catch(() => null) // the summary line is optional
  ]);
  catalog = connectors; health = h;
  fillForm(settings);
  renderSources(settings);
  validateUrlField(els.customSourceUrls, els.customSourceUrlsHint);
  validateUrlField(els.manualLinks, els.manualLinksHint);
  if (dashboard) els.dataSummary.textContent = `${dashboard.counts.total} notices stored · ${dashboard.counts.saved} saved · ${dashboard.counts.dismissed} dismissed`;
  dirty = false; setStatus("All changes saved");
}

/** Read the form into a validated settings patch (same rules the service worker enforces). */
function collect() {
  const enabledSources = [...els.sourceList.querySelectorAll(".source-row")].filter((r) => r.querySelector(".source-check").checked).map((r) => r.dataset.id);
  return normalizeSettingsPatch({
    reliefwebAppName: els.reliefwebAppName.value,
    enabledSources,
    customKeywords: lines(els.customKeywords.value),
    targetGeographies: els.targetGeographies.value.split(","),
    minScore: els.minScore.value,
    highPriorityThreshold: els.highPriorityThreshold.value,
    notificationsEnabled: els.notificationsEnabled.checked,
    customSourceUrls: lines(els.customSourceUrls.value),
    manualLinks: lines(els.manualLinks.value),
    scanIntervalHours: els.scanIntervalHours.value,
    fetchTimeoutMs: secondsToMs(els.fetchTimeoutSec.value),
    maxConcurrentFetches: els.maxConcurrentFetches.value
  });
}

/**
 * Request host permission for any user-added origins. chrome.permissions.request only works inside a
 * user gesture, so it is called synchronously from the click handler (already-granted origins resolve
 * true without a prompt, so no `contains` pre-check that would break the gesture).
 */
function requestOriginsSync(urls) {
  const origins = [...new Set(urls.map(originPattern).filter(Boolean))];
  if (!origins.length) return Promise.resolve({ origins, granted: true });
  return chrome.permissions.request({ origins }).then((granted) => ({ origins, granted }));
}

/** Drop optional host grants that no saved custom URL needs any more (manifest origins are never touched). */
async function revokeUnusedOrigins(saved) {
  try {
    const needed = new Set([...(saved.customSourceUrls || []), ...(saved.manualLinks || [])].map(originPattern).filter(Boolean));
    const manifest = new Set(chrome.runtime.getManifest().host_permissions || []);
    const { origins = [] } = await chrome.permissions.getAll();
    const stale = origins.filter((o) => !manifest.has(o) && !needed.has(o) && o !== "https://*/*");
    if (stale.length) await chrome.permissions.remove({ origins: stale });
  } catch (e) {
    setStatus(`Saved; could not tidy site permissions: ${e.message}`, "is-err");
  }
}

async function saveSettings({ quiet = false, permissionPromise = null } = {}) {
  const patch = collect();
  const perm = permissionPromise ? await permissionPromise : null;
  const saved = await send(MSG.SAVE_SETTINGS, patch);
  dirty = false;
  await revokeUnusedOrigins(saved);
  if (quiet) return;
  if (perm && !perm.granted) setStatus("Saved, but site permission was declined: custom URLs will fail", "is-err");
  else setStatus("Saved", "is-ok");
  renderSources(saved);
}

els.saveBtn.addEventListener("click", () => {
  const urls = [...sanitizeUrlList(lines(els.customSourceUrls.value)), ...sanitizeUrlList(lines(els.manualLinks.value))];
  const permissionPromise = requestOriginsSync(urls).catch(() => ({ granted: false }));
  els.saveBtn.disabled = true;
  saveSettings({ permissionPromise })
    .catch((e) => setStatus(`Save failed: ${e.message}`, "is-err"))
    .finally(() => { els.saveBtn.disabled = false; });
});

for (const el of document.querySelectorAll("input, textarea")) el.addEventListener("input", markDirty);
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

els.scanNow.addEventListener("click", async () => {
  els.scanNow.disabled = true;
  try {
    if (dirty) await saveSettings({ quiet: true });
    const r = await send(MSG.START_SCAN);
    setStatus(r.started ? "Scan started — open the popup to watch progress" : r.reason, r.started ? "is-ok" : "is-err");
  } catch (e) { setStatus(e.message, "is-err"); }
  finally { els.scanNow.disabled = false; }
});

els.clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete every stored opportunity, note, scan log and source health record? Settings are kept.")) return;
  try {
    await send(MSG.CLEAR_DATA);
    health = {};
    await load();
    setStatus("All data deleted", "is-ok");
  } catch (e) {
    setStatus(`Delete failed: ${e.message}`, "is-err");
  }
});

load().catch((e) => setStatus(`Could not load settings: ${e.message}`, "is-err"));

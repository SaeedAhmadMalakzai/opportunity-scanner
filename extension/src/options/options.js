import { MSG, DEFAULT_SETTINGS } from "../lib/types.js";
import { sanitizeUrlList, rejectedUrls, originPattern } from "../lib/urls.js";

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

async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res?.ok) throw new Error(res?.error || "Request failed");
  return res.data;
}

/* ── Theme ── */
async function initTheme() {
  const { os_theme } = await chrome.storage.local.get("os_theme");
  document.documentElement.dataset.theme = os_theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  chrome.storage.local.set({ os_theme: next });
});

/* ── Helpers ── */
const lines = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
const clamp = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; };
function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function setStatus(text, cls = "") { els.saveStatus.textContent = text; els.saveStatus.className = `save-status ${cls}`.trim(); }
function markDirty() { if (!dirty) { dirty = true; setStatus("Unsaved changes", "is-dirty"); } }

/* ── Sources ── */
function healthBadge(el, id, settings) {
  const c = catalog.find((x) => x.id === id);
  const h = health[id];
  el.className = "health";
  if (c?.requiresSetting && !String(settings[c.requiresSetting] || "").trim()) { el.classList.add("is-needs"); el.textContent = "needs appname"; el.title = "Add the ReliefWeb appname above"; return; }
  if (!h) { el.textContent = "not scanned yet"; el.title = ""; return; }
  el.classList.add(`is-${h.status}`);
  el.textContent = h.status === "ok" ? `${h.count} items · ${(h.ms / 1000).toFixed(1)}s · ${timeAgo(h.at)}`
    : h.status === "empty" ? `0 items · ${timeAgo(h.at)}`
    : `failed · ${timeAgo(h.at)}`;
  el.title = h.error || `Last checked ${new Date(h.at).toLocaleString()}`;
}

function renderSources(settings) {
  els.sourceList.replaceChildren();
  const enabled = new Set(settings.enabledSources || []);
  for (const c of catalog) {
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
    healthBadge(row.querySelector(".health"), c.id, settings);
    const result = row.querySelector(".source-result");
    if (health[c.id]?.status === "error") { result.textContent = health[c.id].error; result.className = "source-result is-err"; }
    row.querySelector(".source-test").addEventListener("click", () => testSource(c.id, row));
    els.sourceList.appendChild(row);
  }
  els.sourceList.setAttribute("aria-busy", "false");
}

async function testSource(id, row) {
  const btn = row.querySelector(".source-test");
  const result = row.querySelector(".source-result");
  btn.disabled = true; btn.textContent = "Testing…";
  result.className = "source-result"; result.textContent = "";
  try {
    if (dirty) await saveSettings({ quiet: true });
    const data = await send(MSG.TEST_SOURCE, { id });
    health[id] = data.health;
    healthBadge(row.querySelector(".health"), id, await send(MSG.GET_SETTINGS));
    if (data.health.status === "error") { result.className = "source-result is-err"; result.textContent = data.health.error; }
    else {
      result.className = "source-result is-ok";
      result.textContent = data.health.count ? `Fetched ${data.health.count} items in ${(data.health.ms / 1000).toFixed(1)}s. Latest:` : "Reachable, but no items were found on the page (layout may have changed).";
      if (data.sample.length) {
        const ul = document.createElement("ul");
        for (const s of data.sample) { const li = document.createElement("li"); li.textContent = s.title.slice(0, 90); ul.appendChild(li); }
        result.appendChild(ul);
      }
    }
  } catch (e) { result.className = "source-result is-err"; result.textContent = e.message; }
  finally { btn.disabled = false; btn.textContent = "Test"; }
}

/* ── Validation ── */
function validateUrlField(textarea, hint) {
  const bad = rejectedUrls(lines(textarea.value));
  hint.textContent = bad.length ? `Ignored ${bad.length} line${bad.length > 1 ? "s" : ""} (must be https:// public URLs): ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}` : "";
  hint.className = bad.length ? "hint is-warn" : "hint";
}
els.customSourceUrls.addEventListener("input", () => validateUrlField(els.customSourceUrls, els.customSourceUrlsHint));
els.manualLinks.addEventListener("input", () => validateUrlField(els.manualLinks, els.manualLinksHint));

/* ── Load / save ── */
async function load() {
  els.version.textContent = `v${chrome.runtime.getManifest().version}`;
  await initTheme();
  const [settings, connectors, h, dashboard] = await Promise.all([
    send(MSG.GET_SETTINGS), send(MSG.GET_CONNECTORS), send(MSG.GET_SOURCE_HEALTH), send(MSG.GET_DASHBOARD, { statusFilter: "all" }).catch(() => null)
  ]);
  catalog = connectors; health = h;
  els.reliefwebAppName.value = settings.reliefwebAppName || "";
  els.customKeywords.value = (settings.customKeywords || []).join("\n");
  els.targetGeographies.value = (settings.targetGeographies || []).join(", ");
  els.minScore.value = settings.minScore;
  els.highPriorityThreshold.value = settings.highPriorityThreshold;
  els.notificationsEnabled.checked = settings.notificationsEnabled !== false;
  els.customSourceUrls.value = (settings.customSourceUrls || []).join("\n");
  els.manualLinks.value = (settings.manualLinks || []).join("\n");
  els.scanIntervalHours.value = settings.scanIntervalHours;
  els.fetchTimeoutSec.value = Math.round((settings.fetchTimeoutMs || 25000) / 1000);
  els.maxConcurrentFetches.value = settings.maxConcurrentFetches;
  renderSources(settings);
  validateUrlField(els.customSourceUrls, els.customSourceUrlsHint);
  validateUrlField(els.manualLinks, els.manualLinksHint);
  if (dashboard) els.dataSummary.textContent = `${dashboard.counts.total} notices stored · ${dashboard.counts.saved} saved · ${dashboard.counts.dismissed} dismissed`;
  dirty = false; setStatus("All changes saved");
}

function collect() {
  const enabledSources = [...els.sourceList.querySelectorAll(".source-row")].filter((r) => r.querySelector(".source-check").checked).map((r) => r.dataset.id);
  return {
    reliefwebAppName: els.reliefwebAppName.value.trim(),
    enabledSources: enabledSources.length ? enabledSources : [...DEFAULT_SETTINGS.enabledSources],
    customKeywords: lines(els.customKeywords.value).map((k) => k.toLowerCase()),
    targetGeographies: els.targetGeographies.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean),
    minScore: clamp(els.minScore.value, 0, 100, DEFAULT_SETTINGS.minScore),
    highPriorityThreshold: clamp(els.highPriorityThreshold.value, 50, 100, DEFAULT_SETTINGS.highPriorityThreshold),
    notificationsEnabled: els.notificationsEnabled.checked,
    customSourceUrls: sanitizeUrlList(lines(els.customSourceUrls.value)),
    manualLinks: sanitizeUrlList(lines(els.manualLinks.value)),
    scanIntervalHours: clamp(els.scanIntervalHours.value, 1, 48, DEFAULT_SETTINGS.scanIntervalHours),
    fetchTimeoutMs: clamp(els.fetchTimeoutSec.value, 5, 60, 25) * 1000,
    maxConcurrentFetches: clamp(els.maxConcurrentFetches.value, 1, 8, DEFAULT_SETTINGS.maxConcurrentFetches)
  };
}

/** Request host permission for any user-added origins. Must be triggered from the click handler (user gesture). */
function requestOriginsSync(urls) {
  const origins = [...new Set(urls.map(originPattern).filter(Boolean))];
  if (!origins.length) return Promise.resolve({ origins, granted: true });
  return chrome.permissions.contains({ origins }).then((has) => has ? { origins, granted: true } : chrome.permissions.request({ origins }).then((granted) => ({ origins, granted })));
}

async function saveSettings({ quiet = false, permissionPromise = null } = {}) {
  const settings = collect();
  const perm = permissionPromise ? await permissionPromise : null;
  await send(MSG.SAVE_SETTINGS, settings);
  dirty = false;
  if (quiet) return;
  if (perm && !perm.granted) setStatus("Saved, but site permission was declined: custom URLs will fail", "is-err");
  else setStatus("Saved", "is-ok");
  renderSources(settings);
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
  await send(MSG.CLEAR_DATA);
  health = {};
  await load();
  setStatus("All data deleted", "is-ok");
});

load().catch((e) => setStatus(`Could not load settings: ${e.message}`, "is-err"));

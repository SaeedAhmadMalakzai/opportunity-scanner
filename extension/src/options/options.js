import { getSettings, saveSettings, clearAllData } from "../lib/storage.js";

const minScore = document.getElementById("minScore");
const scanIntervalHours = document.getElementById("scanIntervalHours");
const highPriorityThreshold = document.getElementById("highPriorityThreshold");
const targetGeographies = document.getElementById("targetGeographies");
const fetchTimeoutMs = document.getElementById("fetchTimeoutMs");
const maxConcurrentFetches = document.getElementById("maxConcurrentFetches");
const customKeywords = document.getElementById("customKeywords");
const manualLinks = document.getElementById("manualLinks");
const customSourceUrls = document.getElementById("customSourceUrls");
const sources = document.getElementById("sources");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const msg = document.getElementById("msg");
const themeToggle = document.getElementById("themeToggle");
const sourceHealthEl = document.getElementById("sourceHealth");
let connectorCatalog = [];

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function showMsg(text, type = "success") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
  setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 2500);
}

/* ── Theme ── */
async function initTheme() {
  const { os_theme } = await chrome.storage.local.get("os_theme");
  const theme = os_theme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "\u2600" : "\u263E";
}

themeToggle.addEventListener("click", async () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "\u2600" : "\u263E";
  await chrome.storage.local.set({ os_theme: next });
});

const SOURCE_TIPS = {
  "acbar-rfp": "ACBAR Request for Proposals — Afghan NGO coordination body listing RFPs",
  "acbar-rfq": "ACBAR Request for Quotations — procurement/supply RFQs from NGOs",
  "reliefweb-jobs": "ReliefWeb job listings and consultancy positions in Afghanistan",
  "reliefweb-training": "ReliefWeb training and learning opportunities",
  "worldbank-projects": "World Bank active and pipeline development projects in Afghanistan",
  "undp-procurement": "UNDP procurement notices and tenders for Afghanistan",
  "ungm-tenders": "United Nations Global Marketplace — UN agency tenders worldwide",
  "unjobs-af": "UNJobs — aggregated UN job vacancies and consultancies in Afghanistan",
  "unwomen-procurement": "UN Women procurement opportunities",
  "unops-opportunities": "UNOPS — jobs, tenders, and procurement",
  "wfp-procurement": "World Food Programme procurement — food, logistics, and humanitarian supply",
  "unicef-supply": "UNICEF Supply Division — contracts, consultancies, and procurement",
  "fao-procurement": "FAO — Food and Agriculture Organization procurement calls",
  "iom-procurement": "IOM — International Organization for Migration procurement",
  "afghantenders": "Afghan Tenders — largest Afghan tender aggregator",
  "tendersontime-af": "Tenders On Time — international tender portal with Afghanistan listings",
  "acted-tenders": "ACTED — Agency for Technical Cooperation and Development tenders",
  "akdn-procurement": "AKDN / Aga Khan Development Network — procurement and projects",
  "care-procurement": "CARE International — humanitarian procurement and tenders",
  "actionaid-procurement": "ActionAid — international NGO procurement and tenders"
};

function renderSources(enabledSources) {
  sources.innerHTML = connectorCatalog
    .map((c) => {
      const checked = enabledSources.includes(c.id) ? "checked" : "";
      const escaped = c.label.replace(/</g, "&lt;");
      const tip = (SOURCE_TIPS[c.id] || "").replace(/"/g, "&quot;");
      return `<label title="${tip}"><input type="checkbox" data-source-id="${c.id}" ${checked} />${escaped}</label>`;
    })
    .join("");
}

/* ── Source health ── */
function timeAgo(isoStr) {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function renderSourceHealth() {
  const res = await sendMessage("GET_SOURCE_HEALTH");
  const health = res?.ok ? res.data : {};
  if (!Object.keys(health).length) {
    sourceHealthEl.innerHTML = '<p class="hint">No scan data yet. Run a scan first.</p>';
    return;
  }
  const catalogMap = Object.fromEntries(connectorCatalog.map((c) => [c.id, c.label]));
  let html = `<div class="health-row health-header">
    <span>Source</span><span>Status</span><span>Items</span><span>Time</span>
  </div>`;
  for (const [id, h] of Object.entries(health)) {
    const name = catalogMap[id] || id;
    const statusCls = h.status === "ok" ? "health-ok" : "health-err";
    const statusIcon = h.status === "ok" ? "&#10003;" : "&#10007;";
    const ms = h.ms != null ? `${(h.ms / 1000).toFixed(1)}s` : "—";
    html += `<div class="health-row" title="${h.error || ""}">
      <span class="health-name">${name}</span>
      <span class="${statusCls}">${statusIcon}</span>
      <span>${h.count ?? "—"}</span>
      <span>${ms}</span>
    </div>`;
  }
  sourceHealthEl.innerHTML = html;
}

function linesToArray(text) { return text.split("\n").map((l) => l.trim()).filter(Boolean); }
function arrayToLines(arr) { return (arr || []).join("\n"); }

async function load() {
  await initTheme();
  const connectorsRes = await sendMessage("GET_CONNECTORS");
  connectorCatalog = connectorsRes?.ok ? connectorsRes.data : [];
  const s = await getSettings();
  minScore.value = s.minScore;
  scanIntervalHours.value = s.scanIntervalHours;
  highPriorityThreshold.value = s.highPriorityThreshold || 80;
  targetGeographies.value = (s.targetGeographies || []).join(", ");
  fetchTimeoutMs.value = s.fetchTimeoutMs || 25000;
  maxConcurrentFetches.value = s.maxConcurrentFetches || 3;
  customKeywords.value = arrayToLines(s.customKeywords);
  manualLinks.value = arrayToLines(s.manualLinks);
  customSourceUrls.value = arrayToLines(s.customSourceUrls);
  renderSources(s.enabledSources || []);
  await renderSourceHealth();
}

saveBtn.addEventListener("click", async () => {
  const geographies = targetGeographies.value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const enabledSources = Array.from(
    sources.querySelectorAll("input[type='checkbox']:checked")
  ).map((el) => el.getAttribute("data-source-id"));

  await saveSettings({
    minScore: Math.max(0, Math.min(100, Number(minScore.value || 0))),
    scanIntervalHours: Math.max(1, Math.min(48, Number(scanIntervalHours.value || 12))),
    highPriorityThreshold: Math.max(50, Math.min(100, Number(highPriorityThreshold.value || 80))),
    targetGeographies: geographies,
    enabledSources: enabledSources.length ? enabledSources : ["acbar-rfp", "acbar-rfq", "reliefweb-jobs"],
    fetchTimeoutMs: Math.max(3000, Math.min(60000, Number(fetchTimeoutMs.value || 25000))),
    maxConcurrentFetches: Math.max(1, Math.min(10, Number(maxConcurrentFetches.value || 3))),
    customKeywords: linesToArray(customKeywords.value),
    manualLinks: linesToArray(manualLinks.value),
    customSourceUrls: linesToArray(customSourceUrls.value)
  });

  chrome.alarms.create("scheduledScan", {
    periodInMinutes: Math.max(60, Number(scanIntervalHours.value || 12) * 60)
  });

  showMsg("Settings saved successfully.", "success");
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("This will delete all stored opportunities and scan history. Continue?")) return;
  await sendMessage("CLEAR_DATA");
  showMsg("All data cleared.", "success");
});

load();

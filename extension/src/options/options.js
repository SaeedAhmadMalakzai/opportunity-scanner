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
let connectorCatalog = [];

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function showMsg(text, type = "success") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
  setTimeout(() => { msg.textContent = ""; msg.className = "msg"; }, 2500);
}

const SOURCE_TIPS = {
  "acbar-rfp": "ACBAR Request for Proposals — Afghan NGO coordination body listing RFPs from aid organizations",
  "acbar-rfq": "ACBAR Request for Quotations — procurement/supply RFQs from NGOs operating in Afghanistan",
  "reliefweb-jobs": "ReliefWeb job listings and consultancy positions in Afghanistan",
  "reliefweb-training": "ReliefWeb training and learning opportunities related to Afghanistan",
  "worldbank-projects": "World Bank active and pipeline development projects in Afghanistan",
  "undp-procurement": "UNDP procurement notices and tenders for Afghanistan",
  "ungm-tenders": "United Nations Global Marketplace — UN agency tenders worldwide",
  "unjobs-af": "UNJobs — aggregated UN job vacancies and consultancies in Afghanistan",
  "unwomen-procurement": "UN Women procurement opportunities — gender equality and women empowerment projects",
  "unops-opportunities": "UNOPS — UN Office for Project Services jobs, tenders, and procurement",
  "wfp-procurement": "World Food Programme procurement — food, logistics, and humanitarian supply tenders",
  "unicef-supply": "UNICEF Supply Division — contracts, consultancies, and procurement for children",
  "fao-procurement": "FAO — Food and Agriculture Organization procurement calls and tenders",
  "iom-procurement": "IOM — International Organization for Migration procurement in Afghanistan",
  "afghantenders": "Afghan Tenders — largest Afghan tender aggregator with RFQs, RFPs, ITBs across all provinces",
  "tendersontime-af": "Tenders On Time — international tender portal with Afghanistan consultancy and procurement listings",
  "acted-tenders": "ACTED — Agency for Technical Cooperation and Development, tenders and opportunities",
  "akdn-procurement": "AKDN / Aga Khan Development Network — procurement and projects in Afghanistan",
  "care-procurement": "CARE International — humanitarian procurement, tenders and consultancies",
  "actionaid-procurement": "ActionAid — international NGO procurement and tender opportunities"
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

function linesToArray(text) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

function arrayToLines(arr) {
  return (arr || []).join("\n");
}

async function load() {
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
}

saveBtn.addEventListener("click", async () => {
  const geographies = targetGeographies.value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const enabledSources = Array.from(
    sources.querySelectorAll("input[type='checkbox']:checked")
  ).map((el) => el.getAttribute("data-source-id"));

  await saveSettings({
    minScore: Math.max(0, Math.min(100, Number(minScore.value || 20))),
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

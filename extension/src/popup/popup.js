/* ── DOM refs ── */
const scanBtn = document.getElementById("scanBtn");
const exportBtn = document.getElementById("exportBtn");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const keywordFilter = document.getElementById("keywordFilter");
const minScoreRange = document.getElementById("minScore");
const minScoreValue = document.getElementById("minScoreValue");
const sortBy = document.getElementById("sortBy");
const searchBox = document.getElementById("searchBox");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("resultCount");
const metaEl = document.getElementById("meta");
const statTotal = document.getElementById("statTotal");
const statNew = document.getElementById("statNew");
const statSaved = document.getElementById("statSaved");
const openOptions = document.getElementById("openOptions");
const logDetails = document.getElementById("logDetails");
const scanLogEl = document.getElementById("scanLog");
const themeToggle = document.getElementById("themeToggle");
const viewToggle = document.getElementById("viewToggle");
const selectAll = document.getElementById("selectAll");
const bulkBar = document.getElementById("bulkBar");
const bulkSave = document.getElementById("bulkSave");
const bulkDismiss = document.getElementById("bulkDismiss");
const networkBanner = document.getElementById("networkBanner");
const networkMsg = document.getElementById("networkMsg");
const onboarding = document.getElementById("onboarding");
const dismissOnboarding = document.getElementById("dismissOnboarding");

/* ── State ── */
let viewMode = "comfortable";
let selectedIds = new Set();
let currentItems = [];
let scanStartTime = null;
let elapsedTimer = null;
let idleTimeout = null;
let isScanning = false;

/* ── Helpers ── */
function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str || "";
  return el.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "N/A";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function scoreClass(s) {
  if (s >= 80) return "score-gold";
  if (s >= 60) return "score-green";
  if (s >= 30) return "score-blue";
  return "score-gray";
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

/* ── View mode ── */
async function initView() {
  const { os_viewMode } = await chrome.storage.local.get("os_viewMode");
  viewMode = os_viewMode || "comfortable";
  resultsEl.setAttribute("data-view", viewMode);
  viewToggle.textContent = viewMode === "comfortable" ? "\u2637" : "\u2630";
}

viewToggle.addEventListener("click", async () => {
  viewMode = viewMode === "comfortable" ? "compact" : "comfortable";
  resultsEl.setAttribute("data-view", viewMode);
  viewToggle.textContent = viewMode === "comfortable" ? "\u2637" : "\u2630";
  await chrome.storage.local.set({ os_viewMode: viewMode });
  renderItems();
});

/* ── Network status ── */
function updateNetworkStatus() {
  if (!navigator.onLine) {
    networkBanner.style.display = "block";
    networkBanner.className = "network-banner offline";
    networkMsg.textContent = "Network offline — scan paused until reconnected";
  } else {
    networkBanner.style.display = "none";
  }
}

window.addEventListener("offline", () => {
  updateNetworkStatus();
  if (isScanning) {
    networkBanner.style.display = "block";
    networkBanner.className = "network-banner offline";
    networkMsg.textContent = "Network lost during scan — waiting for reconnection...";
  }
});

window.addEventListener("online", () => {
  networkBanner.style.display = "block";
  networkBanner.className = "network-banner";
  networkMsg.textContent = "Network reconnected";
  setTimeout(() => { if (navigator.onLine) networkBanner.style.display = "none"; }, 3000);
});

/* ── Onboarding ── */
async function checkOnboarding() {
  const { os_onboarded } = await chrome.storage.local.get("os_onboarded");
  if (!os_onboarded) onboarding.style.display = "flex";
}

dismissOnboarding.addEventListener("click", async () => {
  onboarding.style.display = "none";
  await chrome.storage.local.set({ os_onboarded: true });
});

/* ── Card rendering ── */
function itemCard(item) {
  const title = escapeHtml(item.title || "Untitled");
  const score = item.score || 0;
  const sc = scoreClass(score);
  const keywords = (item.matchedKeywords || []).map(escapeHtml).join(", ") || "none";
  const summary = escapeHtml((item.summary || "").slice(0, 200));
  const type = escapeHtml(item.type || "other");
  const location = escapeHtml(item.location || "");
  const status = escapeHtml(item.status || "new");
  const source = escapeHtml(item.sourceDomain || "-");
  const cluster = item.clusterSize > 1 ? `${item.clusterSize} similar` : "";
  const deadline = formatDate(item.deadline);
  const posted = formatDate(item.postedDate);
  const safeUrl = escapeHtml(item.url || "");
  const safeId = escapeHtml(item.id || "");
  const notes = escapeHtml(item.notes || "");
  const checked = selectedIds.has(item.id) ? "checked" : "";

  return `
    <article class="card" data-id="${safeId}">
      <div class="card-inner">
        <input type="checkbox" class="card-check item-check" data-id="${safeId}" ${checked} title="Select this item for bulk actions" />
        <div class="card-body">
          <div class="card-header">
            <span class="card-title" title="${title}">${title}</span>
            <span class="score-badge ${sc}" title="Score ${score}/100">
              ${score}
              <span class="score-bar"><span class="score-bar-fill" style="width:${score}%"></span></span>
            </span>
          </div>
          <div class="card-meta">
            <span class="tag tag-type">${type}</span>
            ${location ? `<span class="tag tag-geo">${location}</span>` : ""}
            <span class="tag tag-status">${status}</span>
            ${cluster ? `<span class="tag">${cluster}</span>` : ""}
          </div>
          <span class="compact-source">${source}</span>
          <span class="compact-deadline">${deadline}</span>
          <dl class="card-details">
            <dt>Source</dt><dd>${source}</dd>
            <dt>Posted</dt><dd>${posted}</dd>
            <dt>Deadline</dt><dd>${deadline}</dd>
          </dl>
          <p class="card-summary">${summary}</p>
          <div class="card-keywords">Matched: ${keywords}</div>
          <div class="card-notes">
            <input type="text" class="note-input" data-id="${safeId}" placeholder="Add note..." value="${notes}" title="Personal note — saved automatically on blur" />
          </div>
          <div class="card-actions">
            <button class="btn btn-sm btn-save" data-action="save" data-id="${safeId}" title="Bookmark">Save</button>
            <button class="btn btn-sm btn-dismiss" data-action="dismiss" data-id="${safeId}" title="Hide">Dismiss</button>
            <button class="btn btn-sm btn-open" data-action="open" data-url="${safeUrl}" title="Open in new tab">Open</button>
            <button class="btn btn-sm btn-copy" data-action="copy" data-url="${safeUrl}" title="Copy link">Copy</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderItems() {
  if (!currentItems.length) {
    resultsEl.innerHTML = document.getElementById("emptyState")?.outerHTML ||
      '<div class="empty-state"><p>No matching opportunities.</p></div>';
    resultCountEl.textContent = "0 results";
    return;
  }
  resultCountEl.textContent = `${currentItems.length} result${currentItems.length === 1 ? "" : "s"}`;
  resultsEl.innerHTML = currentItems.map(itemCard).join("");
  updateBulkBar();
}

/* ── Keyword filter population ── */
function populateKeywordFilter(items) {
  const kws = new Set();
  for (const it of items) {
    for (const k of (it.matchedKeywords || [])) kws.add(k);
  }
  const current = keywordFilter.value;
  keywordFilter.innerHTML = '<option value="all">All Keywords</option>';
  for (const k of [...kws].sort()) {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = k;
    keywordFilter.appendChild(opt);
  }
  if ([...kws].includes(current)) keywordFilter.value = current;
}

/* ── Data fetching ── */
async function refreshCounts() {
  const res = await send("GET_COUNTS");
  if (!res?.ok) return;
  statTotal.textContent = `${res.data.total} total`;
  statNew.textContent = `${res.data.new} new`;
  statSaved.textContent = `${res.data.saved} saved`;
}

async function refreshMeta() {
  const stateRes = await send("GET_SCAN_STATE");
  if (!stateRes?.ok) { metaEl.textContent = "Unable to read state."; metaEl.classList.remove("scanning"); return; }
  const state = stateRes.data;
  if (state.isRunning) {
    if (!isScanning) startScanUI();
    metaEl.classList.add("scanning");
  } else {
    if (isScanning) stopScanUI();
    const lastScan = state.lastScanAt ? formatDate(state.lastScanAt) : "Never";
    const err = state.lastError ? ` | Error: ${state.lastError}` : "";
    metaEl.textContent = `Last scan: ${lastScan} | Found: ${state.lastAddedCount || 0} | Scans: ${state.totalScans || 0}${err}`;
    metaEl.classList.remove("scanning");
  }
  if (state.lastLog) {
    logDetails.style.display = "block";
    scanLogEl.textContent = state.lastLog;
  }
}

function getFilterParams() {
  return {
    typeFilter: typeFilter.value,
    statusFilter: statusFilter.value,
    keywordFilter: keywordFilter.value,
    minScore: Number(minScoreRange.value || 0),
    sortBy: sortBy.value,
    searchQuery: searchBox.value
  };
}

async function refreshResults() {
  const response = await send("GET_RESULTS", getFilterParams());
  if (!response?.ok) {
    resultsEl.innerHTML = '<div class="empty-state"><p>Failed to load results.</p></div>';
    resultCountEl.textContent = "";
    return;
  }
  currentItems = response.data || [];
  populateKeywordFilter(currentItems);
  renderItems();
}

async function refreshAll() {
  await Promise.all([refreshCounts(), refreshMeta(), refreshResults()]);
}

/* ── Scan UI (start/stop/progress) ── */
function startScanUI() {
  isScanning = true;
  scanStartTime = Date.now();
  scanBtn.textContent = "Stop";
  scanBtn.classList.remove("btn-primary");
  scanBtn.classList.add("btn-stop");
  scanBtn.disabled = false;
  metaEl.textContent = "Scan starting...";
  metaEl.classList.add("scanning");
  startElapsedTimer();
  resetIdleTimeout();
  startScanPolling();
}

function stopScanUI() {
  isScanning = false;
  scanBtn.textContent = "Scan Now";
  scanBtn.classList.remove("btn-stop");
  scanBtn.classList.add("btn-primary");
  scanBtn.disabled = false;
  metaEl.classList.remove("scanning");
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  clearTimeout(idleTimeout);
  idleTimeout = null;
  stopPolling();
}

function startElapsedTimer() {
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    if (!isScanning) return;
    const el = fmtElapsed(Date.now() - scanStartTime);
    const base = metaEl.textContent.replace(/ · \d+:\d+$/, "");
    metaEl.textContent = `${base} · ${el}`;
  }, 1000);
}

function resetIdleTimeout() {
  clearTimeout(idleTimeout);
  idleTimeout = setTimeout(async () => {
    if (!isScanning) return;
    await send("STOP_SCAN");
    metaEl.textContent = "Scan auto-stopped (no progress for 60s)";
    stopScanUI();
    await refreshAll();
  }, 60000);
}

scanBtn.addEventListener("click", async () => {
  if (isScanning) {
    scanBtn.disabled = true;
    await send("STOP_SCAN");
    metaEl.textContent = "Stopping scan...";
    return;
  }
  const res = await send("START_SCAN");
  if (!res?.ok) {
    metaEl.textContent = res?.error || "Unable to start scan.";
    return;
  }
  startScanUI();
});

/* ── Live progress from service worker ── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "SCAN_PROGRESS") return;
  const p = msg.data;
  resetIdleTimeout();

  if (p.log) {
    logDetails.style.display = "block";
    scanLogEl.textContent = p.log;
    scanLogEl.scrollTop = scanLogEl.scrollHeight;
  }

  const el = scanStartTime ? ` · ${fmtElapsed(Date.now() - scanStartTime)}` : "";

  switch (p.phase) {
    case "fetching":
      metaEl.textContent = `Scanning... ${p.source || ""} (${p.done}/${p.total})${el}`;
      break;
    case "custom-sources":
      metaEl.textContent = `Fetching custom sources...${el}`;
      break;
    case "manual-links":
      metaEl.textContent = `Fetching manual links...${el}`;
      break;
    case "scoring":
      metaEl.textContent = `Scoring ${p.items || 0} items...${el}`;
      break;
    case "filtering":
      metaEl.textContent = `Filtering expired deadlines...${el}`;
      break;
    case "clustering":
      metaEl.textContent = `Clustering duplicates...${el}`;
      break;
    case "complete":
      metaEl.textContent = `Scan complete — ${p.items || 0} new items`;
      stopScanUI();
      refreshAll();
      break;
    case "stopped":
      metaEl.textContent = `Scan stopped — ${p.items || 0} partial items saved`;
      stopScanUI();
      refreshAll();
      break;
  }

  if (!navigator.onLine && isScanning) {
    networkBanner.style.display = "block";
    networkBanner.className = "network-banner offline";
    networkMsg.textContent = "Network appears offline — scan may fail";
  }
});

/* ── Polling fallback ── */
let pollTimer = null;
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function startScanPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => { await refreshAll(); }, 2000);
}

/* ── Export ── */
exportBtn.addEventListener("click", async () => {
  const ids = selectedIds.size > 0 ? [...selectedIds] : null;
  const res = await send("EXPORT_CSV", ids ? { ...getFilterParams() } : getFilterParams());
  if (!res?.ok || !res.data) { metaEl.textContent = "Export failed."; return; }
  const blob = new Blob(["\uFEFF" + res.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ── Filter/sort events ── */
let debounceTimer = null;
searchBox.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshResults, 300);
});
minScoreRange.addEventListener("input", () => { minScoreValue.textContent = minScoreRange.value; });
minScoreRange.addEventListener("change", refreshResults);
for (const el of [typeFilter, statusFilter, keywordFilter, sortBy]) {
  el.addEventListener("change", refreshResults);
}

/* ── Stat badges ── */
document.getElementById("stats").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  statusFilter.value = btn.dataset.filter;
  for (const s of document.querySelectorAll(".stat")) s.classList.remove("active");
  btn.classList.add("active");
  refreshResults();
});

/* ── Bulk selection ── */
function updateBulkBar() {
  const count = selectedIds.size;
  bulkBar.style.display = count > 0 ? "flex" : "none";
  selectAll.checked = currentItems.length > 0 && count === currentItems.length;
}

selectAll.addEventListener("change", () => {
  if (selectAll.checked) {
    currentItems.forEach((it) => selectedIds.add(it.id));
  } else {
    selectedIds.clear();
  }
  document.querySelectorAll(".item-check").forEach((cb) => { cb.checked = selectAll.checked; });
  updateBulkBar();
});

bulkSave.addEventListener("click", async () => {
  if (!selectedIds.size) return;
  await send("BULK_UPDATE", { ids: [...selectedIds], status: "saved" });
  selectedIds.clear();
  await refreshAll();
});

bulkDismiss.addEventListener("click", async () => {
  if (!selectedIds.size) return;
  await send("BULK_UPDATE", { ids: [...selectedIds], status: "dismissed" });
  selectedIds.clear();
  await refreshAll();
});

/* ── Card interactions ── */
resultsEl.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (target) {
    const action = target.dataset.action;
    if (action === "open" && target.dataset.url) {
      chrome.tabs.create({ url: target.dataset.url });
      return;
    }
    if (action === "copy" && target.dataset.url) {
      await navigator.clipboard.writeText(target.dataset.url);
      target.textContent = "Copied!";
      target.classList.add("copied-flash");
      setTimeout(() => { target.textContent = "Copy"; target.classList.remove("copied-flash"); }, 1200);
      return;
    }
    const id = target.dataset.id;
    if (!id) return;
    if (action === "save") await send("SAVE_ITEM", { id });
    else if (action === "dismiss") await send("DISMISS_ITEM", { id });
    await refreshAll();
    return;
  }

  const cb = event.target.closest(".item-check");
  if (cb) {
    const id = cb.dataset.id;
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    updateBulkBar();
  }
});

resultsEl.addEventListener("blur", async (event) => {
  if (!event.target.classList.contains("note-input")) return;
  const id = event.target.dataset.id;
  const notes = event.target.value.trim();
  await send("SAVE_NOTE", { id, notes });
}, true);

/* ── Settings link ── */
openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

/* ── Init ── */
(async () => {
  await Promise.all([initTheme(), initView(), checkOnboarding()]);
  updateNetworkStatus();
  await refreshAll();
})();

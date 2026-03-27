const scanBtn = document.getElementById("scanBtn");
const exportBtn = document.getElementById("exportBtn");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const minScoreRange = document.getElementById("minScore");
const minScoreValue = document.getElementById("minScoreValue");
const resultsEl = document.getElementById("results");
const resultCountEl = document.getElementById("resultCount");
const metaEl = document.getElementById("meta");
const statTotal = document.getElementById("statTotal");
const statNew = document.getElementById("statNew");
const statSaved = document.getElementById("statSaved");
const openOptions = document.getElementById("openOptions");
const logDetails = document.getElementById("logDetails");
const scanLogEl = document.getElementById("scanLog");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str || "";
  return el.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "N/A";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function scoreBadgeClass(score) {
  if (score >= 80) return "score-high";
  if (score >= 60) return "score-medium";
  return "score-low";
}

function itemCard(item) {
  const title = escapeHtml(item.title || "Untitled");
  const score = item.score || 0;
  const keywords = (item.matchedKeywords || []).map(escapeHtml).join(", ") || "none";
  const summary = escapeHtml((item.summary || "").slice(0, 200));
  const type = escapeHtml(item.type || "other");
  const location = escapeHtml(item.location || "");
  const status = escapeHtml(item.status || "new");
  const source = escapeHtml(item.sourceDomain || "-");
  const confidence = Math.round((item.parserConfidence || 0) * 100);
  const cluster = item.clusterSize > 1 ? `${item.clusterSize} similar` : "";
  const deadline = formatDate(item.deadline);
  const posted = formatDate(item.postedDate);
  const safeUrl = escapeHtml(item.url || "");

  return `
    <article class="card">
      <div class="card-header">
        <span class="card-title" title="Click Open below to view the full listing on the source website">${title}</span>
        <span class="score-badge ${scoreBadgeClass(score)}" title="Relevance score (0-100). Based on keyword matches, geography, opportunity type, recency, and parser confidence. Higher = more relevant to your profile.">${score}</span>
      </div>
      <div class="card-meta">
        <span class="tag tag-type" title="Category auto-detected from the listing title and description (tender, project, training, consultancy, or other)">${type}</span>
        ${location ? `<span class="tag tag-geo" title="Geographic location found in the listing — matches against your target regions for a score boost">${location}</span>` : ""}
        <span class="tag tag-status" title="New = not yet reviewed. Save to bookmark, or Dismiss to hide.">${status}</span>
        ${cluster ? `<span class="tag" title="This listing was found on multiple sources — ${cluster} listings share a very similar title">${cluster}</span>` : ""}
      </div>
      <dl class="card-details">
        <dt title="The website this opportunity was fetched from">Source</dt><dd>${source}</dd>
        <dt title="When this opportunity was originally published">Posted</dt><dd>${posted}</dd>
        <dt title="Submission deadline — expired items are automatically filtered out">Deadline</dt><dd>${deadline}</dd>
        <dt title="How reliably the data was extracted. Higher % = structured source (API/table). Lower % = scraped from general HTML.">Confidence</dt><dd>${confidence}%</dd>
      </dl>
      <p class="card-summary" title="Brief excerpt from the listing page">${summary}</p>
      <div class="card-keywords" title="Keywords from your profile that were found in this listing — more matches = higher score">Matched: ${keywords}</div>
      <div class="card-actions">
        <button class="btn btn-sm btn-save" data-action="save" data-id="${escapeHtml(item.id)}" title="Bookmark this opportunity for later review">Save</button>
        <button class="btn btn-sm btn-dismiss" data-action="dismiss" data-id="${escapeHtml(item.id)}" title="Hide this opportunity — you can still find it using the Dismissed status filter">Dismiss</button>
        <button class="btn btn-sm btn-open" data-action="open" data-url="${safeUrl}" title="Open the original listing in a new browser tab">Open</button>
      </div>
    </article>
  `;
}

async function refreshCounts() {
  const res = await sendMessage("GET_COUNTS");
  if (!res?.ok) return;
  statTotal.textContent = `${res.data.total} total`;
  statNew.textContent = `${res.data.new} new`;
  statSaved.textContent = `${res.data.saved} saved`;
}

async function refreshMeta() {
  const stateRes = await sendMessage("GET_SCAN_STATE");
  if (!stateRes?.ok) {
    metaEl.textContent = "Unable to read state.";
    metaEl.classList.remove("scanning");
    return;
  }
  const state = stateRes.data;
  if (state.isRunning) {
    metaEl.textContent = "Scan in progress...";
    metaEl.classList.add("scanning");
    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning...";
    startScanPolling();
  } else {
    const lastScan = state.lastScanAt ? formatDate(state.lastScanAt) : "Never";
    const err = state.lastError ? ` | Error: ${state.lastError}` : "";
    metaEl.textContent = `Last scan: ${lastScan} | Found: ${state.lastAddedCount || 0} | Total scans: ${state.totalScans || 0}${err}`;
    metaEl.classList.remove("scanning");
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Now";
    stopPolling();
  }
  if (state.lastLog) {
    logDetails.style.display = "block";
    scanLogEl.textContent = state.lastLog;
  }
}

async function refreshResults() {
  const response = await sendMessage("GET_RESULTS", {
    typeFilter: typeFilter.value,
    statusFilter: statusFilter.value,
    minScore: Number(minScoreRange.value || 0)
  });
  if (!response?.ok) {
    resultsEl.innerHTML = '<div class="empty-state"><p>Failed to load results.</p></div>';
    resultCountEl.textContent = "";
    return;
  }
  const items = response.data || [];
  if (!items.length) {
    resultsEl.innerHTML = '<div class="empty-state"><p>No matching opportunities. Try adjusting filters or running a scan.</p></div>';
    resultCountEl.textContent = "0 results";
    return;
  }
  resultCountEl.textContent = `${items.length} result${items.length === 1 ? "" : "s"}`;
  resultsEl.innerHTML = items.map(itemCard).join("");
}

async function refreshAll() {
  await Promise.all([refreshCounts(), refreshMeta(), refreshResults()]);
}

let pollTimer = null;

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startScanPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await refreshAll();
  }, 1500);
}

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";
  const res = await sendMessage("START_SCAN");
  if (!res?.ok) {
    metaEl.textContent = res?.error || "Unable to start scan.";
    metaEl.classList.remove("scanning");
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Now";
    return;
  }
  metaEl.textContent = "Scan started...";
  metaEl.classList.add("scanning");
  startScanPolling();
});

exportBtn.addEventListener("click", async () => {
  const res = await sendMessage("EXPORT_CSV", {
    typeFilter: typeFilter.value,
    statusFilter: statusFilter.value,
    minScore: Number(minScoreRange.value || 0)
  });
  if (!res?.ok || !res.data) {
    metaEl.textContent = "Export failed.";
    return;
  }
  const blob = new Blob(["\uFEFF" + res.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

minScoreRange.addEventListener("input", () => {
  minScoreValue.textContent = minScoreRange.value;
});
minScoreRange.addEventListener("change", refreshResults);

for (const el of [typeFilter, statusFilter]) {
  el.addEventListener("change", refreshResults);
}

document.getElementById("stats").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  statusFilter.value = btn.dataset.filter;
  for (const s of document.querySelectorAll(".stat")) s.classList.remove("active");
  btn.classList.add("active");
  refreshResults();
});

resultsEl.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "open" && target.dataset.url) {
    chrome.tabs.create({ url: target.dataset.url });
    return;
  }

  const id = target.dataset.id;
  if (!id) return;
  if (action === "save") await sendMessage("SAVE_ITEM", { id });
  else if (action === "dismiss") await sendMessage("DISMISS_ITEM", { id });
  await refreshAll();
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshAll();

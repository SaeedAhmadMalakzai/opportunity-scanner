/** Scan lifecycle in the popup: start/stop, live progress panel, polling fallback and the end-of-scan message. */
import { SCAN_PHASES } from "../lib/types.js";
import { fmtElapsed } from "../ui/format.js";
import { describeProgress, finishMessage } from "./progress.js";
import { showBanner, hideBanner } from "./banner.js";
import { showToast } from "./toast.js";

const ELAPSED_TICK_MS = 1000;
const POLL_INTERVAL_MS = 1500;
const IDLE_WARNING_MS = 45000;
const ALREADY_RUNNING_BANNER_MS = 3000;
const SUMMARY_BANNER_MS = 8000;
const SUMMARY_TOAST_MS = 3500;
const IDLE_TEXT = "Still working… a slow source is holding things up";
const TERMINAL_PHASES = new Set([SCAN_PHASES.COMPLETE, SCAN_PHASES.STOPPED, SCAN_PHASES.FAILED]);

function renderRunning(container, running) {
  container.replaceChildren();
  if (!running) return;
  const b = document.createElement("b");
  b.textContent = running.lead;
  container.append(b, running.detail);
}

let deps = null;
let els = null;

/**
 * Wire the module to the popup's elements and services; call once before any other export.
 * @param {{ els: object, api: object, refresh: (opts?: object) => Promise<void>, getState: () => object,
 *   labelFor: (id: string) => string }} d
 */
export function initScanUi(d) {
  deps = d;
  els = d.els;
}

const getState = () => deps.getState();

let scanning = false;
let startedAt = 0;
let timers = { elapsed: null, poll: null, idle: null };

function clearTimers() {
  clearInterval(timers.elapsed); clearInterval(timers.poll); clearTimeout(timers.idle);
  timers = { elapsed: null, poll: null, idle: null };
}

function armIdleWatchdog() {
  clearTimeout(timers.idle);
  timers = { ...timers, idle: setTimeout(async () => {
    // A failed status read is transient; the regular poll will retry.
    const st = await deps.api.scanState().catch(() => null);
    if (st?.isRunning) { els.scanText.textContent = IDLE_TEXT; armIdleWatchdog(); }
  }, IDLE_WARNING_MS) };
}

function applyProgress(p) {
  armIdleWatchdog();
  const progress = describeProgress(p, deps.labelFor);
  els.scanBar.classList.toggle("indeterminate", !progress.determinate);
  els.scanBar.style.width = progress.determinate ? `${progress.pct}%` : "";
  els.scanText.textContent = progress.text;
  renderRunning(els.scanRunning, progress.running);
}

export function enterScanningUi(st) {
  scanning = true;
  startedAt = st?.startedAt ? Date.parse(st.startedAt) : Date.now();
  els.scanPanel.hidden = false;
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = "Scanning";
  els.stopBtn.disabled = false;
  els.stopBtn.textContent = "Stop";
  applyProgress(st?.progress || { phase: SCAN_PHASES.CONNECTORS, done: 0, total: 0 });
  clearInterval(timers.elapsed); clearInterval(timers.poll);
  const tick = () => { els.scanElapsed.textContent = fmtElapsed(Date.now() - startedAt); };
  tick();
  timers = { ...timers, elapsed: setInterval(tick, ELAPSED_TICK_MS), poll: setInterval(pollScanState, POLL_INTERVAL_MS) };
}

function exitScanningUi() {
  scanning = false;
  clearTimers();
  els.scanPanel.hidden = true;
  els.scanBtn.disabled = false;
  els.scanBtn.textContent = "Scan";
}

async function finishScan(p) {
  if (!scanning) return;
  exitScanningUi();
  await deps.refresh({ keepFocus: false });
  const { health, scanState } = getState();
  const failing = Object.values(health).filter((h) => h.status === "error").length;
  const msg = finishMessage(p, scanState, failing);
  if (msg.kind === "toast") { showToast(msg.text, { duration: SUMMARY_TOAST_MS }); return; }
  const details = msg.details ? { actionLabel: "Details", onAction: () => chrome.runtime.openOptionsPage(), timeout: SUMMARY_BANNER_MS } : {};
  showBanner(msg.text, { tone: msg.tone, ...details });
}

async function pollScanState() {
  // A failed status read is transient; the next poll retries.
  const st = await deps.api.scanState().catch(() => null);
  if (!st) return;
  if (st.isRunning) { if (st.progress) applyProgress(st.progress); return; }
  await finishScan(st.progress || { phase: st.lastError ? SCAN_PHASES.FAILED : SCAN_PHASES.COMPLETE, items: st.lastAddedCount, error: st.lastError });
}

export async function startScan() {
  if (scanning) return;
  hideBanner();
  try {
    const res = await deps.api.startScan();
    if (!res.started) { showBanner(res.reason || "Scan already running", { timeout: ALREADY_RUNNING_BANNER_MS }); return; }
    enterScanningUi({ startedAt: new Date().toISOString() });
  } catch (e) {
    showBanner(`Could not start scan: ${e.message}`, { tone: "danger" });
  }
}

export async function stopScan() {
  els.stopBtn.disabled = true;
  els.stopBtn.textContent = "Stopping…";
  try {
    await deps.api.stopScan();
  } catch (e) {
    els.stopBtn.disabled = false;
    els.stopBtn.textContent = "Stop";
    showBanner(`Could not stop the scan: ${e.message}`, { tone: "danger" });
  }
}

/** Handler for SCAN_PROGRESS broadcasts from the service worker. */
export function handleScanProgress(p) {
  if (TERMINAL_PHASES.has(p.phase)) { finishScan(p); return; }
  if (!scanning) enterScanningUi({ startedAt: new Date().toISOString(), progress: p });
  else applyProgress(p);
}

export function isScanning() {
  return scanning;
}

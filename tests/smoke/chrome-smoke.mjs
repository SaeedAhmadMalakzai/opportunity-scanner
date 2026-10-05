/**
 * Loads the unpacked extension into a real headless Chrome, opens the popup and options pages,
 * runs a live scan, and reports console errors, per-source health and screenshots.
 * Usage: node tests/smoke/chrome-smoke.mjs [--no-scan]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

/** Chrome derives an unpacked extension id from the sha256 of its absolute path (hex a-p alphabet). */
function unpackedExtensionId(path) {
  const hex = createHash("sha256").update(path).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
}

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

/* Branded Google Chrome 137+ ignores --load-extension, so prefer a Chrome for Testing / Chromium build (Playwright cache) when present. */
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of dirs) {
      for (const rel of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = join(cache, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}
const CHROME = findChrome();
const EXT = resolve("extension");
const OUT = resolve(process.env.SMOKE_OUT || "tests/smoke/out");
const RUN_SCAN = !process.argv.includes("--no-scan");
const PORT = 9333 + Math.floor(Math.random() * 500);
mkdirSync(OUT, { recursive: true });

const userDir = mkdtempSync(join(tmpdir(), "os-smoke-"));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${userDir}`, `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
  "--window-size=1200,900", "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });
let stderr = "";
chrome.stderr.on("data", (d) => { stderr += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error(`Chrome did not expose DevTools\n${stderr}`);
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; ws.onmessage = (e) => this.onMessage(JSON.parse(e.data)); }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return new CDP(ws); }
  onMessage(m) {
    if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else for (const l of this.listeners) l(m);
  }
  send(method, params = {}, sessionId) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params, sessionId })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(fn) { this.listeners.push(fn); }
  close() { this.ws.close(); }
}

const report = { consoleErrors: [], pages: {}, scan: null };
function trackConsole(cdp, sessionId, label) {
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Runtime.exceptionThrown") report.consoleErrors.push({ page: label, text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) report.consoleErrors.push({ page: label, text: m.params.args.map((a) => a.value ?? a.description).join(" ") });
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") report.consoleErrors.push({ page: label, text: m.params.entry.text });
  });
}

async function openPage(cdp, url, label, { width = 480, height = 600 } = {}) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false }, sessionId);
  trackConsole(cdp, sessionId, label);
  await cdp.send("Page.navigate", { url }, sessionId);
  await sleep(900);
  return { sessionId, targetId };
}
async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(cdp, sessionId, name) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
}

try {
  const version = await waitForDevtools();
  const cdp = await CDP.connect(version.webSocketDebuggerUrl);
  const extId = unpackedExtensionId(EXT);
  report.extensionId = extId;
  // Opening an extension page wakes the MV3 service worker; then attach to it for console capture.
  const probe = await openPage(cdp, `chrome-extension://${extId}/src/popup/popup.html`, "probe");
  const probeText = await evaluate(cdp, probe.sessionId, `document.title + " | " + document.body.innerText.slice(0, 200)`);
  if (!/Opportunity Scanner/.test(probeText)) throw new Error(`Extension did not load (id ${extId}): ${probeText}\n${stderr.slice(-2000)}`);
  await cdp.send("Target.closeTarget", { targetId: probe.targetId });
  let sw = null;
  for (let i = 0; i < 20 && !sw; i++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    sw = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(extId));
    if (!sw) await sleep(250);
  }
  if (!sw) throw new Error("Extension service worker never started");
  const swSession = (await cdp.send("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).sessionId;
  await cdp.send("Runtime.enable", {}, swSession);
  trackConsole(cdp, swSession, "service-worker");

  const popup = await openPage(cdp, `chrome-extension://${extId}/src/popup/popup.html`, "popup");
  await sleep(600);
  report.pages.popupInitial = await evaluate(cdp, popup.sessionId, `({ title: document.title, onboarding: !document.getElementById("onboarding").hidden, results: document.querySelectorAll(".card").length, empty: document.querySelector(".empty-title")?.textContent || null, version: document.getElementById("version").textContent })`);
  await screenshot(cdp, popup.sessionId, "popup-initial-light");
  await evaluate(cdp, popup.sessionId, `document.getElementById("dismissOnboarding").hidden ? null : chrome.storage.local.set({ os_onboarded: true }).then(() => { document.getElementById("onboarding").hidden = true; })`);

  if (RUN_SCAN) {
    const t0 = Date.now();
    await evaluate(cdp, popup.sessionId, `chrome.runtime.sendMessage({ type: "START_SCAN" })`);
    let state;
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      state = await evaluate(cdp, popup.sessionId, `chrome.runtime.sendMessage({ type: "GET_SCAN_STATE" }).then(r => r.data)`);
      if (i === 3) await screenshot(cdp, popup.sessionId, "popup-scanning");
      if (!state.isRunning) break;
    }
    const dash = await evaluate(cdp, popup.sessionId, `chrome.runtime.sendMessage({ type: "GET_DASHBOARD", payload: {} }).then(r => r.data)`);
    report.scan = { seconds: Math.round((Date.now() - t0) / 1000), lastError: state.lastError, added: state.lastAddedCount, stats: state.lastStats, health: dash.health, counts: dash.counts, sources: dash.facets.sources, log: state.lastLog };
    await sleep(800);
    report.pages.popupAfterScan = await evaluate(cdp, popup.sessionId, `({ cards: document.querySelectorAll(".card").length, count: document.getElementById("resultCount").textContent, lastScan: document.getElementById("lastScan").textContent, banner: document.getElementById("banner").hidden ? null : document.getElementById("bannerText").textContent, firstTitle: document.querySelector(".card-title")?.textContent?.trim() || null })`);
    await screenshot(cdp, popup.sessionId, "popup-results-light");
    await evaluate(cdp, popup.sessionId, `document.getElementById("themeToggle").click()`); await sleep(300);
    await screenshot(cdp, popup.sessionId, "popup-results-dark");
    await evaluate(cdp, popup.sessionId, `document.getElementById("densityToggle").click()`); await sleep(300);
    await screenshot(cdp, popup.sessionId, "popup-results-dark-compact");
    await evaluate(cdp, popup.sessionId, `document.getElementById("densityToggle").click(); document.getElementById("themeToggle").click()`);
    // interaction: dismiss first card and undo
    await evaluate(cdp, popup.sessionId, `document.querySelector('.card [data-action="dismiss"]')?.click()`); await sleep(400);
    report.pages.afterDismiss = await evaluate(cdp, popup.sessionId, `({ toast: document.getElementById("toast").hidden ? null : document.getElementById("toastText").textContent, cards: document.querySelectorAll(".card:not(.is-leaving)").length })`);
    await evaluate(cdp, popup.sessionId, `document.getElementById("toastAction").click()`); await sleep(500);
    report.pages.afterUndo = await evaluate(cdp, popup.sessionId, `({ cards: document.querySelectorAll(".card").length })`);
  }

  const options = await openPage(cdp, `chrome-extension://${extId}/src/options/options.html`, "options", { width: 900, height: 1400 });
  await sleep(800);
  report.pages.options = await evaluate(cdp, options.sessionId, `({ sources: document.querySelectorAll(".source-row").length, healthBadges: [...document.querySelectorAll(".health")].map(h => h.textContent), version: document.getElementById("version").textContent, status: document.getElementById("saveStatus").textContent })`);
  await screenshot(cdp, options.sessionId, "options-light");

  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const errs = report.consoleErrors.filter((e) => !/net::ERR_|Failed to load resource/.test(e.text));
  console.log(JSON.stringify({ ...report, scan: report.scan && { ...report.scan, log: undefined }, consoleErrors: errs }, null, 2));
  if (report.scan?.log) console.log("\n--- scan log ---\n" + report.scan.log);
  cdp.close();
  process.exitCode = errs.length ? 1 : 0;
} catch (e) {
  console.error("SMOKE FAILED:", e.message);
  process.exitCode = 2;
} finally {
  chrome.kill("SIGKILL");
}

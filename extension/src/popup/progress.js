/** Pure text/shape decisions for the scan progress panel and the end-of-scan message. */
import { SCAN_PHASES } from "../lib/types.js";
import { plural } from "../ui/format.js";

const PERCENT = 100;
const FIXED_PHASE_TEXT = Object.freeze({
  [SCAN_PHASES.CUSTOM_SOURCES]: "Crawling your custom source pages…",
  [SCAN_PHASES.MANUAL_LINKS]: "Reading your manual links…",
  [SCAN_PHASES.SAVING]: "Saving results…"
});

function progressText(p, done, total) {
  if (p.phase === SCAN_PHASES.CONNECTORS) {
    const found = p.items != null ? ` · ${p.items} fetched` : "";
    return total ? `Fetching sources ${done}/${total}${found}` : "Starting sources…";
  }
  if (p.phase === SCAN_PHASES.SCORING) return `Scoring ${p.items || 0} notices…`;
  return FIXED_PHASE_TEXT[p.phase] || "Working…";
}

function runningLine(p, labelFor) {
  if (p.running?.length) return { lead: "Now: ", detail: p.running.map(labelFor).join(", ") };
  if (!p.lastSource) return null;
  const h = p.lastHealth;
  const outcome = h?.status === "error" ? `failed: ${h.error}` : plural(h?.count || 0, "item");
  return { lead: p.lastSource, detail: ` · ${outcome}` };
}

/**
 * @returns {{ determinate: boolean, pct: number|null, text: string, running: { lead: string, detail: string }|null }}
 */
export function describeProgress(p, labelFor = (id) => id) {
  const total = Number(p.total) || 0;
  const done = Number(p.done) || 0;
  const determinate = p.phase === SCAN_PHASES.CONNECTORS && total > 0;
  return {
    determinate,
    pct: determinate ? Math.round((done / total) * PERCENT) : null,
    text: progressText(p, done, total),
    running: runningLine(p, labelFor)
  };
}

/**
 * What to tell the user when a scan ends. Failing sources turn a toast into a banner with a Details link.
 * @returns {{ kind: "banner"|"toast", text: string, tone: "danger"|"info"|"ok", details: boolean }}
 */
export function finishMessage(p, scanState, failingCount) {
  if (p.phase === SCAN_PHASES.FAILED) {
    return { kind: "banner", tone: "danger", details: false, text: `Scan failed: ${p.error || scanState?.lastError || "unknown error"}` };
  }
  const n = p.items ?? scanState?.lastAddedCount ?? 0;
  const text = p.phase === SCAN_PHASES.STOPPED
    ? `Stopped · ${plural(n, "new notice")} saved`
    : n ? `${plural(n, "new notice")} found` : "No new notices since last scan";
  if (failingCount) return { kind: "banner", tone: "info", details: true, text: `${text} · ${plural(failingCount, "source")} failed` };
  return { kind: "toast", tone: "ok", details: false, text };
}

import { acbarConnectors } from "./acbar.js";
import { ungmConnectors } from "./ungm.js";
import { worldBankConnectors } from "./worldbank.js";
import { afghanTendersConnectors } from "./afghantenders.js";
import { actedConnectors } from "./acted.js";
import { actionAidConnectors } from "./actionaid.js";
import { reliefWebConnectors } from "./reliefweb.js";
import { govAfConnectors } from "./gov-af.js";
import { unamaConnectors } from "./unama.js";
import { undpConnectors } from "./undp.js";

export const CONNECTORS = Object.freeze({
  ...acbarConnectors,
  ...ungmConnectors,
  ...worldBankConnectors,
  ...afghanTendersConnectors,
  ...actedConnectors,
  ...actionAidConnectors,
  ...reliefWebConnectors,
  ...unamaConnectors,
  ...undpConnectors,
  ...govAfConnectors
});

/** Connector ids from older releases that no longer exist; used to migrate saved settings. */
export const RETIRED_CONNECTOR_IDS = Object.freeze([
  "ungm-tenders", "undp-procurement", "unjobs-af", "unwomen-procurement", "unops-opportunities",
  "wfp-procurement", "unicef-supply", "fao-procurement", "iom-procurement", "tendersontime-af",
  "akdn-procurement", "care-procurement", "actionaid-procurement"
]);

export function getConnectorCatalog() {
  return Object.entries(CONNECTORS).map(([id, c]) => ({
    id, label: c.label, description: c.description || "", homepage: c.homepage || "", requiresSetting: c.requiresSetting || null, group: c.group || "International"
  }));
}

export function getConnector(id) {
  return CONNECTORS[id] || null;
}

/** Run one connector and return a health record plus its items (never throws). */
export async function runConnector(id, ctx) {
  const c = CONNECTORS[id];
  const t0 = Date.now();
  if (!c) return { id, items: [], health: { status: "error", count: 0, ms: 0, at: new Date().toISOString(), error: "Unknown source" } };
  try {
    const items = await c.fetchItems(ctx);
    const ms = Date.now() - t0;
    ctx.log?.(`${c.label}: ${items.length} items (${ms}ms)`);
    return { id, items, health: { status: items.length ? "ok" : "empty", count: items.length, ms, at: new Date().toISOString(), error: null } };
  } catch (err) {
    const ms = Date.now() - t0;
    const message = err?.name === "AbortError" ? "Timed out" : String(err?.message || err);
    ctx.log?.(`${c.label}: ERROR - ${message} (${ms}ms)`);
    return { id, items: [], health: { status: "error", count: 0, ms, at: new Date().toISOString(), error: message, isTimeout: err?.name === "AbortError" } };
  }
}

/** Run a set of async tasks with bounded concurrency; stops scheduling new tasks once shouldAbort() is true. */
export async function runPool(tasks, concurrency, shouldAbort = () => false) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, async () => {
    while (next < tasks.length && !shouldAbort()) {
      const task = tasks[next++];
      await task();
    }
  });
  await Promise.all(workers);
}

/**
 * Fetch every enabled connector in parallel (bounded by settings.maxConcurrentFetches).
 * @returns {Promise<{ items: object[], health: Record<string, object> }>}
 */
export async function fetchAllConnectorItems(ctx, { onProgress, shouldAbort = () => false } = {}) {
  const enabled = (ctx.settings.enabledSources || []).filter((id) => CONNECTORS[id]);
  ctx.log?.(`Enabled sources: ${enabled.join(", ") || "(none)"}`);
  const total = enabled.length;
  const concurrency = Math.max(1, Number(ctx.settings.maxConcurrentFetches) || 4);
  const health = {};
  const items = [];
  let done = 0;
  const running = new Set();

  const tasks = enabled.map((id) => async () => {
    running.add(id);
    onProgress?.({ done, total, running: [...running], items: items.length });
    const result = await runConnector(id, ctx);
    running.delete(id);
    done++;
    health[id] = result.health;
    items.push(...result.items);
    onProgress?.({ done, total, running: [...running], items: items.length, lastSource: CONNECTORS[id].label, lastHealth: result.health });
  });

  await runPool(tasks, concurrency, shouldAbort);
  return { items, health };
}

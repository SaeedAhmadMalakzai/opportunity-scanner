/** Network access for the service worker: https-only, size-capped, timeout-bounded fetches. */
import { isSafeHttpsUrl } from "../lib/urls.js";
import { LIMITS, DEFAULT_SETTINGS } from "../lib/types.js";
import { resolveTimeoutMs } from "../lib/settings.js";

const BYTES_PER_MB = 1048576;
const MS_PER_SECOND = 1000;
const ACCEPT_HTML = "text/html,application/xhtml+xml,*/*;q=0.8";
const ACCEPT_JSON = "application/json";
const ACCEPT_LANGUAGE = "en-US,en;q=0.9";

function hostOf(url) {
  return new URL(url).hostname;
}

async function readCapped(response, cap = LIMITS.MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader?.();
  if (!reader) return await response.text();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) {
      // Best-effort release of the connection; the size error below is what matters.
      reader.cancel().catch(() => {});
      throw new Error(`Response larger than ${Math.round(cap / BYTES_PER_MB)} MB`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return new TextDecoder("utf-8").decode(merged);
}

function describeFetchError(err, url, timeout, redirect) {
  if (err?.name === "AbortError") {
    const e = new Error(`Timed out after ${Math.round(timeout / MS_PER_SECOND)}s`);
    e.name = "AbortError";
    return e;
  }
  if (err instanceof TypeError && redirect === "error") return new Error(`${hostOf(url)} redirected or was unreachable (redirects are refused for this source)`);
  if (err instanceof TypeError) return new Error(`Network error reaching ${hostOf(url)} (offline, DNS, or permission denied)`);
  return err;
}

export async function fetchRaw(url, { timeout = DEFAULT_SETTINGS.fetchTimeoutMs, headers = {}, method = "GET", body, credentials = "omit", accept, redirect = "follow" } = {}) {
  if (!isSafeHttpsUrl(url)) throw new Error("Blocked unsafe URL");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method, body, credentials, signal: controller.signal, redirect,
      headers: { Accept: accept, "Accept-Language": ACCEPT_LANGUAGE, ...headers }
    });
    if (response.url && !isSafeHttpsUrl(response.url)) throw new Error("Redirected to an unsafe host");
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${hostOf(url)}`);
    return await readCapped(response);
  } catch (err) {
    throw describeFetchError(err, url, timeout, redirect);
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text, url) {
  try {
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(`Invalid JSON from ${hostOf(url)}`);
    throw err;
  }
}

/** Fetch helpers handed to connectors as ctx.fetchText / ctx.fetchJson. */
export function makeFetchers(settings) {
  const timeout = resolveTimeoutMs(settings);
  return {
    fetchText: (url, opts = {}) => fetchRaw(url, { timeout, accept: ACCEPT_HTML, ...opts }),
    fetchJson: async (url, opts = {}) => parseJson(await fetchRaw(url, { timeout, accept: ACCEPT_JSON, ...opts }), url)
  };
}

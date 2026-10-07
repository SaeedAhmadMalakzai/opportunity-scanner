/** Messaging between extension pages (popup, options) and the service worker. Never imported by the worker. */
import { MSG } from "../lib/types.js";

/** Send a typed request to the service worker and unwrap its { ok, data, error } envelope. */
export async function send(type, payload = {}) {
  let res;
  try { res = await chrome.runtime.sendMessage({ type, payload }); }
  catch (e) { throw new Error(e?.message || "Extension background is not responding"); }
  if (!res?.ok) throw new Error(res?.error || "Request failed");
  return res.data;
}

export function onScanProgress(handler) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === MSG.SCAN_PROGRESS) handler(msg.data || {});
  });
}

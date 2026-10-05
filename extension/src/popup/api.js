import { MSG } from "../lib/types.js";

async function send(type, payload = {}) {
  let res;
  try { res = await chrome.runtime.sendMessage({ type, payload }); }
  catch (e) { throw new Error(e?.message || "Extension background is not responding"); }
  if (!res?.ok) throw new Error(res?.error || "Request failed");
  return res.data;
}

export const api = {
  dashboard: (params) => send(MSG.GET_DASHBOARD, params),
  scanState: () => send(MSG.GET_SCAN_STATE),
  startScan: () => send(MSG.START_SCAN),
  stopScan: () => send(MSG.STOP_SCAN),
  setStatus: (id, status) => send(MSG.SET_STATUS, { id, status }),
  bulkUpdate: (ids, status) => send(MSG.BULK_UPDATE, { ids, status }),
  restore: (restore) => send(MSG.BULK_UPDATE, { restore }),
  saveNote: (id, notes) => send(MSG.SAVE_NOTE, { id, notes }),
  exportCsv: (params) => send(MSG.EXPORT_CSV, params)
};

export function onScanProgress(handler) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === MSG.SCAN_PROGRESS) handler(msg.data || {});
  });
}

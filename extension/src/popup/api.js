import { MSG } from "../lib/types.js";
import { send } from "../ui/messaging.js";

export { onScanProgress } from "../ui/messaging.js";

export const api = {
  dashboard: (params) => send(MSG.GET_DASHBOARD, params),
  connectors: () => send(MSG.GET_CONNECTORS),
  scanState: () => send(MSG.GET_SCAN_STATE),
  startScan: () => send(MSG.START_SCAN),
  stopScan: () => send(MSG.STOP_SCAN),
  setStatus: (id, status) => send(MSG.SET_STATUS, { id, status }),
  bulkUpdate: (ids, status) => send(MSG.BULK_UPDATE, { ids, status }),
  restore: (restore) => send(MSG.BULK_UPDATE, { restore }),
  saveNote: (id, notes) => send(MSG.SAVE_NOTE, { id, notes }),
  exportCsv: (params) => send(MSG.EXPORT_CSV, params)
};

/** Per-item and bulk actions: optimistic state updates with rollback, undo toasts, CSV export, copy link. */
import { ITEM_STATUS } from "../lib/types.js";
import { plural } from "../ui/format.js";
import { updateCard } from "./render.js";
import { cardById, renderCounts, renderResults, setSelection } from "./view.js";
import { showBanner } from "./banner.js";
import { showToast } from "./toast.js";
import { nextStatus, withItemStatus, withItemNote, withoutItem, adjustCounts, leavesView } from "./state.js";

const LEAVE_ANIMATION_MS = 220;
const TITLE_TOAST_MAX = 48;
const COPY_FLASH_MS = 1200;
const OBJECT_URL_REVOKE_MS = 1000;
const EXPORT_TOAST_MS = 2500;
const CLIPBOARD_BANNER_MS = 2500;
const CSV_BOM = "\uFEFF";
const STATUS_VERB = Object.freeze({ [ITEM_STATUS.SAVED]: "Saved", [ITEM_STATUS.DISMISSED]: "Dismissed", [ITEM_STATUS.NEW]: "Restored" });

const shortTitle = (title = "") => (title.length > TITLE_TOAST_MAX ? `${title.slice(0, TITLE_TOAST_MAX)}…` : title);
const reportUndoError = (e) => showBanner(`Undo failed: ${e.message}`, { tone: "danger" });

let deps = null;

/**
 * Wire the module to the popup's state and services; call once before any other export.
 * @param {{ api: object, getState: () => object, setState: (patch: object) => void,
 *   refresh: (opts?: object) => Promise<void> }} d
 */
export function initItemActions(d) {
  deps = d;
}

const getState = () => deps.getState();
const setState = (patch) => deps.setState(patch);

const findItem = (id) => getState().items.find((i) => i.id === id);

/** After the leave animation, drop the item from state unless its status changed meanwhile (undo, failure, refresh). */
function removeAfterLeave(id, status) {
  if (findItem(id)?.status !== status) return;
  const { items, selectedIds, focusedId } = getState();
  setState({ items: withoutItem(items, id), selectedIds: new Set([...selectedIds].filter((s) => s !== id)), focusedId: focusedId === id ? null : focusedId });
  renderResults();
}

/** Toggle an item towards `target` (Save/Dismiss); a second press moves it back to New. */
export async function changeStatus(id, target) {
  const snapshot = { items: getState().items, counts: getState().counts };
  const item = snapshot.items.find((i) => i.id === id);
  if (!item) return;
  const status = nextStatus(item.status, target);
  setState({ items: withItemStatus(snapshot.items, id, status), counts: adjustCounts(snapshot.counts, item.status, status) });
  renderCounts();
  const card = cardById(id);
  if (card) updateCard(card, { ...item, status });
  if (leavesView(getState().params.statusFilter, status)) {
    card?.classList.add("is-leaving");
    setTimeout(() => removeAfterLeave(id, status), LEAVE_ANIMATION_MS);
  }
  try {
    await deps.api.setStatus(id, status);
  } catch (e) {
    setState(snapshot);
    showBanner(`Could not update: ${e.message}`, { tone: "danger" });
    await deps.refresh();
    return;
  }
  showToast(`${STATUS_VERB[status]} “${shortTitle(item.title)}”`, {
    actionLabel: "Undo",
    onAction: async () => { await deps.api.setStatus(id, item.status); await deps.refresh(); },
    onError: reportUndoError
  });
}

export async function saveNote(input) {
  const card = input.closest(".card");
  const id = card.dataset.id;
  const item = findItem(id);
  const notes = input.value.trim();
  const previous = item?.notes || "";
  if (!item || notes === previous) { if (!notes) card.querySelector(".card-note").hidden = true; return; }
  setState({ items: withItemNote(getState().items, id, notes) });
  card.classList.toggle("has-note", Boolean(notes));
  try {
    await deps.api.saveNote(id, notes);
  } catch (e) {
    setState({ items: withItemNote(getState().items, id, previous) });
    card.classList.toggle("has-note", Boolean(previous));
    showBanner(`Note not saved: ${e.message}`, { tone: "danger" });
  }
}

export async function bulkStatus(status) {
  const ids = [...getState().selectedIds];
  if (!ids.length) return;
  setSelection(new Set());
  try {
    const { previous } = await deps.api.bulkUpdate(ids, status);
    await deps.refresh();
    showToast(`${STATUS_VERB[status]} ${plural(ids.length, "notice")}`, {
      actionLabel: "Undo",
      onAction: async () => { await deps.api.restore(previous); await deps.refresh(); },
      onError: reportUndoError
    });
  } catch (e) {
    showBanner(`Bulk update failed: ${e.message}`, { tone: "danger" });
  }
}

export async function exportCsv(ids = null) {
  try {
    const csv = await deps.api.exportCsv({ ...getState().params, ids });
    const url = URL.createObjectURL(new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_MS);
    showToast(`Exported ${plural(ids ? ids.length : getState().items.length, "row")}`, { duration: EXPORT_TOAST_MS });
  } catch (e) {
    showBanner(`Export failed: ${e.message}`, { tone: "danger" });
  }
}

export async function copyLink(btn, card) {
  try {
    await navigator.clipboard.writeText(card.dataset.url);
  } catch {
    // The browser refused clipboard access; tell the user instead of failing silently.
    showBanner("Clipboard blocked by the browser", { tone: "danger", timeout: CLIPBOARD_BANNER_MS });
    return;
  }
  btn.textContent = "Copied";
  btn.classList.add("is-flash");
  setTimeout(() => { btn.textContent = "Copy link"; btn.classList.remove("is-flash"); }, COPY_FLASH_MS);
}

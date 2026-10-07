/** Event wiring for the result list, the select-all checkbox and the bulk action bar. */
import { ITEM_STATUS } from "../lib/types.js";
import * as view from "./view.js";
import * as actions from "./item-actions.js";

async function onCardClick(e, getState) {
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.classList.contains("card-check")) {
    const next = new Set(getState().selectedIds);
    if (e.target.checked) next.add(id); else next.delete(id);
    view.setSelection(next);
    return;
  }
  const btn = e.target.closest("button[data-action]");
  if (!btn) { view.setFocused(id, { scroll: false }); return; }
  switch (btn.dataset.action) {
    case "save": await actions.changeStatus(id, ITEM_STATUS.SAVED); break;
    case "dismiss": await actions.changeStatus(id, ITEM_STATUS.DISMISSED); break;
    case "note": { const wrap = card.querySelector(".card-note"); wrap.hidden = false; wrap.querySelector("input").focus(); break; }
    case "copy": await actions.copyLink(btn, card); break;
  }
}

/**
 * @param {{ els: object, getState: () => object }} deps
 */
export function bindResultEvents({ els, getState }) {
  els.results.addEventListener("click", (e) => onCardClick(e, getState));
  els.results.addEventListener("focusout", (e) => {
    if (e.target.classList.contains("note-input")) actions.saveNote(e.target);
  });
  els.selectAll.addEventListener("change", () => {
    view.setSelection(els.selectAll.checked ? new Set(getState().items.map((i) => i.id)) : new Set());
  });
  els.bulkClear.addEventListener("click", () => view.setSelection(new Set()));
  els.bulkSave.addEventListener("click", () => actions.bulkStatus(ITEM_STATUS.SAVED));
  els.bulkDismiss.addEventListener("click", () => actions.bulkStatus(ITEM_STATUS.DISMISSED));
  els.bulkExport.addEventListener("click", () => actions.exportCsv([...getState().selectedIds]));
}

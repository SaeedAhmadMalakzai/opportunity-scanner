/** DOM rendering for result cards. All content is set via textContent (never innerHTML). */
import { cardViewModel, planReconcile } from "./card-model.js";

let template = null;
/** Looked up on first use so this module can be imported (and its pure parts tested) without a DOM. */
function cardTemplate() {
  template ??= document.getElementById("cardTemplate");
  return template;
}

function setText(el, text) { el.textContent = text || ""; }

function applyTitle(node, title) {
  const el = node.querySelector(".card-title");
  setText(el, title.text);
  el.href = title.href;
  el.title = title.tooltip;
  el.classList.toggle("rtl", title.rtl);
}

function applyScore(node, score) {
  const el = node.querySelector(".score");
  setText(el.querySelector(".score-value"), String(score.value));
  el.style.setProperty("--pct", String(score.value));
  el.title = score.tooltip;
}

function applyMeta(node, meta) {
  setText(node.querySelector(".meta-org"), meta.org);
  setText(node.querySelector(".meta-source"), meta.source);
  setText(node.querySelector(".meta-loc"), meta.location);
  setText(node.querySelector(".meta-type"), meta.type);
}

function applyDeadline(node, vm) {
  const el = node.querySelector(".deadline");
  setText(el, vm.deadline.text);
  el.className = `deadline ${vm.deadline.cls}`.trim();
  el.title = vm.deadline.tooltip;
  setText(node.querySelector(".posted"), vm.posted);
  setText(node.querySelector(".cluster"), vm.cluster);
}

function keywordChip(text, className, title = "") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  if (title) span.title = title;
  return span;
}

function applyKeywords(node, vm) {
  const chips = vm.keywords.map((k) => keywordChip(k.text, k.custom ? "kw kw-custom" : "kw"));
  if (vm.moreKeywords) chips.push(keywordChip(vm.moreKeywords.text, "kw kw-more", vm.moreKeywords.title));
  node.querySelector(".card-keywords").replaceChildren(...chips);
}

function applyActions(node, actions) {
  const saveBtn = node.querySelector('[data-action="save"]');
  saveBtn.textContent = actions.saveLabel;
  saveBtn.classList.toggle("is-active", actions.saveActive);
  saveBtn.title = actions.saveTitle;
  node.querySelector('[data-action="dismiss"]').textContent = actions.dismissLabel;
}

/** Apply a card view model to a card node; `selected` is only applied when provided. */
export function applyCardView(node, vm, { selected } = {}) {
  node.dataset.tier = vm.tier;
  node.dataset.status = vm.status;
  node.dataset.url = vm.url;
  node.classList.toggle("has-note", vm.hasNote);
  if (selected !== undefined) {
    node.querySelector(".card-check").checked = selected;
    node.classList.toggle("is-selected", selected);
  }
  applyTitle(node, vm.title);
  applyScore(node, vm.score);
  applyMeta(node, vm.meta);
  applyDeadline(node, vm);
  setText(node.querySelector(".card-summary"), vm.summary);
  applyKeywords(node, vm);
  const note = node.querySelector(".note-input");
  if (note.value !== vm.notes) note.value = vm.notes;
  applyActions(node, vm.actions);
  return node;
}

export function updateCard(node, item, options) {
  return applyCardView(node, cardViewModel(item), options);
}

function buildCard(item, options) {
  const node = cardTemplate().content.firstElementChild.cloneNode(true);
  node.dataset.id = item.id;
  return updateCard(node, item, options);
}

export function buildEmptyState({ title, hint, actions = [] }) {
  const wrap = document.createElement("div");
  wrap.className = "empty";
  const h = document.createElement("p"); h.className = "empty-title"; h.textContent = title;
  const p = document.createElement("p"); p.className = "empty-hint"; p.textContent = hint;
  wrap.append(h, p);
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.primary ? "btn btn-primary" : "btn btn-ghost";
    b.textContent = a.label;
    b.addEventListener("click", a.onClick);
    wrap.appendChild(b);
  }
  return wrap;
}

/** Keyed reconciliation: reuse existing card nodes, add new ones, remove stale ones, keep order. */
export function renderList(container, items, { selectedIds, focusedId }) {
  const existing = new Map([...container.querySelectorAll(".card")].map((n) => [n.dataset.id, n]));
  const plan = planReconcile([...existing.keys()], items);
  const reuse = new Set(plan.reuse);
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const options = { selected: selectedIds.has(item.id) };
    const node = reuse.has(item.id) ? updateCard(existing.get(item.id), item, options) : buildCard(item, options);
    node.classList.remove("is-leaving"); // a card whose removal was undone comes back fully visible
    node.classList.toggle("is-focused", item.id === focusedId);
    frag.appendChild(node);
  }
  for (const id of plan.remove) existing.get(id).remove();
  for (const el of [...container.children]) if (!el.classList.contains("card")) el.remove();
  container.appendChild(frag);
}

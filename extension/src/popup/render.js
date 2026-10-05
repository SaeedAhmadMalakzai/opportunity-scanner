import { describeDeadline, formatDate, relativeTime, scoreTier, isRtl } from "./format.js";

const template = document.getElementById("cardTemplate");
const MAX_KEYWORDS = 4;

function setText(el, text) { el.textContent = text || ""; }

/** Build a card element for an item (safe: all content set via textContent). */
export function buildCard(item, { selected = false } = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.id = item.id;
  updateCard(node, item, { selected });
  return node;
}

export function updateCard(node, item, { selected } = {}) {
  const score = Math.round(item.score || 0);
  node.dataset.tier = scoreTier(score);
  node.dataset.status = item.status || "new";
  node.dataset.url = item.url || "";
  node.classList.toggle("has-note", Boolean(item.notes));
  if (selected !== undefined) {
    node.querySelector(".card-check").checked = selected;
    node.classList.toggle("is-selected", selected);
  }

  const title = node.querySelector(".card-title");
  setText(title, item.title || "Untitled");
  title.href = item.url || "#";
  title.title = item.title || "";
  title.classList.toggle("rtl", isRtl(item.title));

  const scoreEl = node.querySelector(".score");
  setText(scoreEl.querySelector(".score-value"), String(score));
  scoreEl.style.setProperty("--pct", String(score));
  scoreEl.title = `Relevance ${score}/100 · parser confidence ${Math.round((item.parserConfidence || 0) * 100)}%`;

  setText(node.querySelector(".meta-org"), item.organization || "");
  setText(node.querySelector(".meta-source"), item.sourceDomain || "");
  setText(node.querySelector(".meta-loc"), item.location || "");
  setText(node.querySelector(".meta-type"), item.type || "");

  const dl = describeDeadline(item.deadline);
  const dlEl = node.querySelector(".deadline");
  setText(dlEl, dl.text);
  dlEl.className = `deadline ${dl.cls}`.trim();
  dlEl.title = item.deadline ? `Deadline ${formatDate(item.deadline)}` : "";
  const posted = node.querySelector(".posted");
  setText(posted, item.postedDate ? `Posted ${relativeTime(item.postedDate)}` : item.firstSeenAt ? `Found ${relativeTime(item.firstSeenAt)}` : "");
  setText(node.querySelector(".cluster"), item.clusterSize > 1 ? `${item.clusterSize} similar` : "");

  const summary = (item.summary || "").trim();
  setText(node.querySelector(".card-summary"), summary === (item.title || "").trim() ? "" : summary.slice(0, 240));

  const kwWrap = node.querySelector(".card-keywords");
  kwWrap.replaceChildren();
  const custom = new Set(item.matchedCustomKeywords || []);
  const kws = item.matchedKeywords || [];
  for (const k of kws.slice(0, MAX_KEYWORDS)) {
    const span = document.createElement("span");
    span.className = custom.has(k) ? "kw kw-custom" : "kw";
    span.textContent = k;
    kwWrap.appendChild(span);
  }
  if (kws.length > MAX_KEYWORDS) {
    const more = document.createElement("span");
    more.className = "kw kw-more";
    more.textContent = `+${kws.length - MAX_KEYWORDS}`;
    more.title = kws.slice(MAX_KEYWORDS).join(", ");
    kwWrap.appendChild(more);
  }

  const note = node.querySelector(".note-input");
  if (note.value !== (item.notes || "")) note.value = item.notes || "";

  const saveBtn = node.querySelector('[data-action="save"]');
  const isSaved = item.status === "saved";
  saveBtn.textContent = isSaved ? "Saved" : "Save";
  saveBtn.classList.toggle("is-active", isSaved);
  saveBtn.title = isSaved ? "Move back to New" : "Bookmark for follow-up";
  const dismissBtn = node.querySelector('[data-action="dismiss"]');
  dismissBtn.textContent = item.status === "dismissed" ? "Restore" : "Dismiss";
  return node;
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
  const frag = document.createDocumentFragment();
  for (const item of items) {
    let node = existing.get(item.id);
    if (node) { updateCard(node, item, { selected: selectedIds.has(item.id) }); existing.delete(item.id); }
    else node = buildCard(item, { selected: selectedIds.has(item.id) });
    node.classList.toggle("is-focused", item.id === focusedId);
    frag.appendChild(node);
  }
  for (const stale of existing.values()) stale.remove();
  for (const el of [...container.children]) if (!el.classList.contains("card")) el.remove();
  container.appendChild(frag);
}

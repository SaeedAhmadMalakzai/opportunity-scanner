/** Filter controls: reflect params into the form and turn user input into param patches. */
import { DEFAULT_PARAMS, withCurrentOption } from "./state.js";

const SEARCH_DEBOUNCE_MS = 180;

export function syncFilterControls(els, params) {
  els.search.value = params.searchQuery || "";
  els.typeFilter.value = params.typeFilter;
  els.sortBy.value = params.sortBy;
  els.minScore.value = String(params.minScore);
  els.minScoreValue.value = String(params.minScore);
  for (const b of els.statusSeg.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.status === params.statusFilter));
  els.showClosed.checked = Boolean(params.showClosed);
  const extraActive = params.keywordFilter !== "all" || params.sourceFilter !== "all" || params.showClosed;
  if (extraActive) { els.extraFilters.hidden = false; els.moreFilters.setAttribute("aria-expanded", "true"); }
  els.moreFilters.textContent = extraActive ? "More ·" : "More";
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

/** Fill a facet <select>; an active value with no remaining matches stays selected as "value (0)". */
export function fillSelect(select, options, current, allLabel) {
  const all = withCurrentOption(options, current);
  select.replaceChildren(option("all", allLabel), ...all.map(({ value, count }) => option(value, `${value} (${count})`)));
  select.value = current;
}

/**
 * @param {{ els: object, getParams: () => object, onChange: (patch: object, opts?: { clearSelection?: boolean }) => void }} deps
 */
export function bindFilters({ els, getParams, onChange }) {
  let searchTimer = null;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onChange({ searchQuery: els.search.value.trim() }), SEARCH_DEBOUNCE_MS);
  });
  els.minScore.addEventListener("input", () => { els.minScoreValue.value = els.minScore.value; });
  els.minScore.addEventListener("change", () => onChange({ minScore: Number(els.minScore.value) }));
  els.typeFilter.addEventListener("change", () => onChange({ typeFilter: els.typeFilter.value }));
  els.sortBy.addEventListener("change", () => onChange({ sortBy: els.sortBy.value }));
  els.keywordFilter.addEventListener("change", () => onChange({ keywordFilter: els.keywordFilter.value }));
  els.sourceFilter.addEventListener("change", () => onChange({ sourceFilter: els.sourceFilter.value }));
  els.showClosed.addEventListener("change", () => onChange({ showClosed: els.showClosed.checked }));
  els.statusSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-status]");
    if (b) onChange({ statusFilter: b.dataset.status }, { clearSelection: true });
  });
  els.moreFilters.addEventListener("click", () => {
    const open = els.extraFilters.hidden;
    els.extraFilters.hidden = !open;
    els.moreFilters.setAttribute("aria-expanded", String(open));
  });
  els.resetFilters.addEventListener("click", () => onChange({ ...DEFAULT_PARAMS, sortBy: getParams().sortBy }));
}

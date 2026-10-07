/** Pure view models for result cards (no DOM), so card rendering rules can be unit tested. */
import { describeDeadline, formatDate, relativeTime, scoreTier, isRtl } from "../ui/format.js";
import { ITEM_STATUS } from "../lib/types.js";

export const SUMMARY_MAX = 240;
export const MAX_KEYWORDS = 4;
const MAX_SCORE = 100;

function clampScore(score) {
  return Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score) || 0)));
}

function postedText(item, now) {
  if (item.postedDate) return `Posted ${relativeTime(item.postedDate, now)}`;
  if (item.firstSeenAt) return `Found ${relativeTime(item.firstSeenAt, now)}`;
  return "";
}

function keywordView(item) {
  const all = item.matchedKeywords || [];
  const custom = new Set(item.matchedCustomKeywords || []);
  const rest = all.slice(MAX_KEYWORDS);
  return {
    keywords: all.slice(0, MAX_KEYWORDS).map((text) => ({ text, custom: custom.has(text) })),
    moreKeywords: rest.length ? { text: `+${rest.length}`, title: rest.join(", ") } : null
  };
}

function actionsView(status) {
  const isSaved = status === ITEM_STATUS.SAVED;
  return {
    saveLabel: isSaved ? "Saved" : "Save",
    saveActive: isSaved,
    saveTitle: isSaved ? "Move back to New" : "Bookmark for follow-up",
    dismissLabel: status === ITEM_STATUS.DISMISSED ? "Restore" : "Dismiss"
  };
}

/** Everything a card displays, derived from one stored item at a fixed time. */
export function cardViewModel(item, now = Date.now()) {
  const score = clampScore(item.score);
  const rawTitle = item.title || "";
  const summary = (item.summary || "").trim();
  const status = item.status || ITEM_STATUS.NEW;
  const deadline = describeDeadline(item.deadline, now);
  return {
    id: item.id, url: item.url || "", status, tier: scoreTier(score),
    notes: item.notes || "", hasNote: Boolean(item.notes),
    title: { text: rawTitle || "Untitled", href: item.url || "#", tooltip: rawTitle, rtl: isRtl(rawTitle) },
    score: { value: score, tooltip: `Relevance ${score}/100 · parser confidence ${Math.round((item.parserConfidence || 0) * 100)}%` },
    meta: { org: item.organization || "", source: item.sourceDomain || "", location: item.location || "", type: item.type || "" },
    deadline: { text: deadline.text, cls: deadline.cls, tooltip: item.deadline ? `Deadline ${formatDate(item.deadline)}` : "" },
    posted: postedText(item, now),
    cluster: item.clusterSize > 1 ? `${item.clusterSize} similar` : "",
    summary: summary === rawTitle.trim() ? "" : summary.slice(0, SUMMARY_MAX),
    ...keywordView(item),
    actions: actionsView(status)
  };
}

/**
 * Keyed reconciliation plan: which ids get new nodes, which existing nodes are reused, which are removed,
 * and the final order (the order of `items`).
 */
export function planReconcile(existingIds, items) {
  const existing = new Set(existingIds);
  const order = items.map((it) => it.id);
  const wanted = new Set(order);
  return {
    order,
    create: order.filter((id) => !existing.has(id)),
    reuse: order.filter((id) => existing.has(id)),
    remove: [...existing].filter((id) => !wanted.has(id))
  };
}

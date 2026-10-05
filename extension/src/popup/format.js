import { daysUntil } from "../lib/dates.js";

const RTL = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function isRtl(text) { return RTL.test(String(text || "").slice(0, 40)); }

export function formatDate(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMin = Math.round((now - t) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

/** Describe a deadline for a chip: { text, cls } with urgency classes. */
export function describeDeadline(iso, now = Date.now()) {
  if (!iso) return { text: "", cls: "" };
  const days = daysUntil(iso, now);
  if (days === null) return { text: "", cls: "" };
  if (days < 0) return { text: `Closed ${formatDate(iso)}`, cls: "is-past" };
  if (days === 0) return { text: "Due today", cls: "is-urgent" };
  if (days === 1) return { text: "Due tomorrow", cls: "is-urgent" };
  if (days <= 3) return { text: `Due in ${days} days`, cls: "is-urgent" };
  if (days <= 7) return { text: `Due in ${days} days`, cls: "is-soon" };
  return { text: `Due ${formatDate(iso)}`, cls: "" };
}

export function scoreTier(score) {
  if (score >= 80) return "gold";
  if (score >= 60) return "green";
  if (score >= 30) return "blue";
  return "gray";
}

export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

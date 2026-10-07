/** Pure description of a source's health badge on the options page. */
import { relativeTime, plural, fmtSeconds } from "../ui/format.js";

function healthText(health, when) {
  if (health.status === "ok") return `${plural(health.count, "item")} · ${fmtSeconds(health.ms)} · ${when}`;
  if (health.status === "empty") return `0 items · ${when}`;
  return `failed · ${when}`;
}

/**
 * @param {object|undefined} health  last health record for the source
 * @param {object|undefined} catalogEntry  connector catalog entry (requiresSetting, ...)
 * @param {object} settings  current (possibly unsaved) settings
 * @param {number} [now]
 * @returns {{ cls: string, text: string, title: string }}
 */
export function healthBadgeView(health, catalogEntry, settings, now = Date.now()) {
  const needs = catalogEntry?.requiresSetting;
  if (needs && !String(settings?.[needs] || "").trim()) {
    return { cls: "health is-needs", text: "needs appname", title: "Add the ReliefWeb appname above" };
  }
  if (!health) return { cls: "health", text: "not scanned yet", title: "" };
  const text = healthText(health, relativeTime(health.at, now));
  return { cls: `health is-${health.status}`, text, title: health.error || `Last checked ${new Date(health.at).toLocaleString()}` };
}

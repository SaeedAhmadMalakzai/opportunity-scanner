/** Helpers shared by connectors. Keep parsed output byte-for-byte stable when changing these. */

export const TITLE_MAX = 200;
export const SUMMARY_MAX = 400;
const SUMMARY_SEPARATOR = " · ";

/** Join the non-empty parts of a summary and cap its length. */
export function joinSummary(parts, max, { sep = SUMMARY_SEPARATOR } = {}) {
  return parts.filter(Boolean).join(sep).slice(0, max);
}

/**
 * Connector that fetches one HTML page and parses it.
 * @param {{ label: string, description: string, homepage: string, url?: string,
 *   parse: (html: string) => object[], group?: string }} spec  url defaults to homepage
 */
export function htmlConnector({ label, description, homepage, url = homepage, parse, group }) {
  return {
    label, description, homepage, group,
    fetchItems: async (ctx) => parse(await ctx.fetchText(url))
  };
}

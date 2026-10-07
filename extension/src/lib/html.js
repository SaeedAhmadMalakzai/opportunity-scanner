/**
 * Lightweight HTML text utilities for regex-based scraping (no DOM available in service workers).
 *
 * Every helper here runs in linear time on hostile input. The rule: an opening-tag regex may only use
 * `[^<>]` (never `[^>]` or `[\s\S]*?`) for attributes, and the matching closing tag is always located
 * with indexOf. Lazy `[\s\S]*?</tag>` spans are quadratic when a page contains many openers and no
 * closer, which is enough for one malicious source to freeze the service worker for minutes.
 */

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®"
};

export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp) {
  try { return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ""; }
  catch { return ""; }
}

/** Remove every span from `open` to `close` (case-insensitive literals), replacing it with a space. O(n). */
export function stripBetween(html, open, close) {
  const src = String(html ?? "");
  const low = src.toLowerCase();
  const openLow = open.toLowerCase();
  const closeLow = close.toLowerCase();
  let out = "";
  let i = 0;
  for (;;) {
    const s = low.indexOf(openLow, i);
    if (s === -1) return out + src.slice(i);
    const e = low.indexOf(closeLow, s + openLow.length);
    if (e === -1) return out + src.slice(i, s);
    out += `${src.slice(i, s)} `;
    i = e + closeLow.length;
  }
}

function globalCopy(re) {
  return new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}g`);
}

/**
 * Find elements whose opening tag matches `openRe` (which must bound attributes with `[^<>]`) and whose
 * closing tag is the literal `closeTag`. Non-overlapping, case-insensitive on the closer, O(n).
 * Each result: { attrs (first capture group or ""), inner, outer, start, end }.
 */
export function allElements(html, openRe, closeTag, { first = false } = {}) {
  const src = String(html ?? "");
  const low = src.toLowerCase();
  const closeLow = closeTag.toLowerCase();
  const re = globalCopy(openRe);
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const openEnd = m.index + m[0].length;
    const closeAt = low.indexOf(closeLow, openEnd);
    if (closeAt === -1) break; // no closer anywhere after this opener, so no later opener can match either
    const end = closeAt + closeTag.length;
    out.push({ attrs: m[1] ?? "", inner: src.slice(openEnd, closeAt), outer: src.slice(m.index, end), start: m.index, end });
    if (first) break;
    re.lastIndex = Math.max(end, re.lastIndex);
  }
  return out;
}

/** First element matching openRe/closeTag, or null. */
export function firstElement(html, openRe, closeTag) {
  return allElements(html, openRe, closeTag, { first: true })[0] ?? null;
}

/** Inner HTML of the first element matching openRe/closeTag, or "". */
export function innerOf(html, openRe, closeTag) {
  return firstElement(html, openRe, closeTag)?.inner ?? "";
}

/** Text content (tags stripped, entities decoded, capped) of the first element, or the fallback. */
export function textOf(html, openRe, closeTag, fallback = "", max = 400) {
  const inner = innerOf(html, openRe, closeTag);
  const text = inner ? stripHtml(inner).slice(0, max) : "";
  return text || fallback;
}

/** Remove tags, scripts, styles and comments, decode entities, collapse whitespace. O(n). */
export function stripHtml(html) {
  let s = String(html ?? "");
  s = stripBetween(s, "<script", "</script>");
  s = stripBetween(s, "<style", "</style>");
  s = stripBetween(s, "<!--", "-->");
  s = s.replace(/<br\s*\/?>/gi, " ").replace(/<[^<>]+>/g, " ");
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

/** Value of an attribute inside an attribute string (quoted with " or '), or "". */
export function attrValue(attrs, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = String(attrs ?? "").match(new RegExp(`(?:^|\\s)${esc}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[1] ?? m[2] ?? "") : "";
}

/** Content of <meta property=key> or <meta name=key>, scanning each meta tag once. O(n). */
export function metaContent(html, key) {
  const wanted = String(key).toLowerCase();
  const re = /<meta\b([^<>]*)>/gi;
  const src = String(html ?? "");
  let m;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1];
    const id = attrValue(attrs, "property") || attrValue(attrs, "name");
    if (id.toLowerCase() !== wanted) continue;
    const content = attrValue(attrs, "content");
    if (content) return content;
  }
  return "";
}

/** Split an HTML document into blocks that start with the given opening-tag marker regex (`[^<>]`-bounded). */
export function splitBlocks(html, markerRe) {
  const src = String(html ?? "");
  const re = globalCopy(markerRe);
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    starts.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return starts.map((s, i) => src.slice(s, starts[i + 1] ?? src.length));
}

/** Anchor tags with an href; yields { href, inner, attrs }. O(n). */
export function anchors(html) {
  const out = [];
  for (const el of allElements(html, /<a\b([^<>]*)>/gi, "</a>")) {
    const href = attrValue(el.attrs, "href");
    if (!href) continue;
    out.push({ href: decodeEntities(href.trim()), inner: el.inner, attrs: el.attrs });
  }
  return out;
}

const AF_LOCATION = /\b(afghanistan|kabul|herat|mazar-i-sharif|mazar-e-sharif|mazar|kandahar|jalalabad|balkh|badakhshan|bamyan|bamiyan|nangarhar|helmand|kunduz|takhar|baghlan|paktia|paktya|ghazni|logar|parwan|kapisa|panjshir|samangan|faryab|jawzjan|sar-e-pul|daykundi|daikundi|ghor|badghis|nimroz|nimruz|farah|zabul|uruzgan|khost|paktika|nuristan|kunar|laghman|wardak|maidan wardak)\b/i;

export function extractAfghanLocation(text) {
  return String(text ?? "").match(AF_LOCATION)?.[0] || "";
}

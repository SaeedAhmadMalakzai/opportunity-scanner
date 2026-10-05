/** Lightweight HTML text utilities for regex-based scraping (no DOM available in service workers). */

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

/** Remove tags, scripts, styles and decode entities, collapsing whitespace. */
export function stripHtml(html) {
  return decodeEntities(
    String(html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

export function textBetween(re, html, fallback = "") {
  const m = String(html ?? "").match(re);
  return m?.[1] ? stripHtml(m[1]).slice(0, 400) : fallback;
}

export function metaContent(html, key) {
  const src = String(html ?? "");
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    src.match(new RegExp(`<meta[^>]+property=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
    src.match(new RegExp(`<meta[^>]+name=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ||
    src.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, "i"))?.[1] ||
    ""
  );
}

/** Split an HTML document into blocks that start with the given opening-tag marker regex. */
export function splitBlocks(html, markerRe) {
  const src = String(html ?? "");
  const re = new RegExp(markerRe.source, markerRe.flags.includes("g") ? markerRe.flags : `${markerRe.flags}g`);
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    starts.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return starts.map((s, i) => src.slice(s, starts[i + 1] ?? src.length));
}

/** Iterate anchor tags; yields { href, inner, tag } objects. */
export function anchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const src = String(html ?? "");
  let m;
  while ((m = re.exec(src)) !== null) {
    const href = m[1].match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!href) continue;
    out.push({ href: decodeEntities(href.trim()), inner: m[2], attrs: m[1] });
  }
  return out;
}

const AF_LOCATION = /\b(afghanistan|kabul|herat|mazar-i-sharif|mazar-e-sharif|mazar|kandahar|jalalabad|balkh|badakhshan|bamyan|bamiyan|nangarhar|helmand|kunduz|takhar|baghlan|paktia|paktya|ghazni|logar|parwan|kapisa|panjshir|samangan|faryab|jawzjan|sar-e-pul|daykundi|daikundi|ghor|badghis|nimroz|nimruz|farah|zabul|uruzgan|khost|paktika|nuristan|kunar|laghman|wardak|maidan wardak)\b/i;

export function extractAfghanLocation(text) {
  return String(text ?? "").match(AF_LOCATION)?.[0] || "";
}

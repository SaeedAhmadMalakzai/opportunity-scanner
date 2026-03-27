function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}

function textBetween(re, html, fallback = "") {
  const m = html.match(re);
  return m?.[1] ? stripHtml(m[1]).slice(0, 400) : fallback;
}

function extractDeadline(text) {
  const pats = [
    /(deadline|closing date|due date|submission date)\s*[:\-]?\s*([a-z0-9,\-\/ ]{6,40})/i,
    /([0-3]?\d[\/\-][0-1]?\d[\/\-](?:20)?\d{2})/i
  ];
  for (const p of pats) { const m = text.match(p); if (m) return (m[2] || m[1] || "").trim(); }
  return null;
}

function normalizeDateString(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.length < 4) return null;
  const d = Date.parse(raw);
  if (!Number.isNaN(d)) {
    const dt = new Date(d);
    if (dt.getFullYear() >= 2000 && dt.getFullYear() <= 2100) return dt.toISOString();
  }
  const c = raw.match(/([0-3]?\d)[\/\-]([0-1]?\d)[\/\-]((?:19|20)?\d{2})/);
  if (c) {
    let y = Number(c[3]); if (y < 100) y += 2000;
    const day = Number(c[1]), mon = Number(c[2]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12 && y >= 2000)
      return new Date(Date.UTC(y, mon - 1, day)).toISOString();
  }
  return null;
}

function extractPostedDate(text) {
  const pats = [
    /(posted on|publication date|published|date posted)\s*[:\-]?\s*([a-z0-9,\-\/ ]{6,40})/i,
    /(20\d{2}[\/\-][01]?\d[\/\-][0-3]?\d)/i
  ];
  for (const p of pats) {
    const m = text.match(p);
    const n = normalizeDateString((m?.[2] || m?.[1] || "").trim());
    if (n) return n;
  }
  return null;
}

const LOC = /\b(afghanistan|kabul|herat|mazar-i-sharif|mazar|kandahar|jalalabad|balkh|badakhshan|bamyan|nangarhar|helmand|kunduz|takhar|baghlan|paktia|ghazni|logar|parwan|kapisa|panjshir|samangan|faryab|jawzjan|sar-e-pul|daykundi|ghor|badghis|nimroz|farah|zabul|uruzgan|khost|paktika|nuristan|kunar|laghman|wardak)\b/i;

function extractLocation(text) { return text.match(LOC)?.[0] || ""; }

function meta(html, key) {
  return (
    html.match(new RegExp(`<meta[^>]+property="${key}"[^>]+content="([^"]+)"`, "i"))?.[1] ||
    html.match(new RegExp(`<meta[^>]+name="${key}"[^>]+content="([^"]+)"`, "i"))?.[1] || ""
  );
}

export function parseHtmlListingPage(html, baseUrl, sourceDomain, sourceType = "other") {
  const items = [];
  const rx = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const href = m[1], txt = stripHtml(m[2]);
    if (txt.length < 15 || href === baseUrl || href === baseUrl + "/") continue;
    items.push({
      title: txt.slice(0, 200), organization: "", type: sourceType,
      location: extractLocation(txt), deadline: null, postedDate: null,
      url: href, sourceDomain, summary: txt, parserConfidence: 0.5,
      parserSource: `listing:${sourceDomain}`
    });
  }
  return items.slice(0, 30);
}

export function parseOpportunityPage(html, url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("reliefweb.int")) return parseDomain(html, url, "reliefweb", 0.9);
  if (host.includes("ungm.org")) return parseDomain(html, url, "ungm", 0.88);
  return parseDomain(html, url, "generic", 0.55);
}

function parseDomain(html, url, label, confidence) {
  const body = stripHtml(html);
  const title = meta(html, "og:title") || textBetween(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html, "") || textBetween(/<title[^>]*>([\s\S]*?)<\/title>/i, html, "Untitled");
  const summary = meta(html, "description") || body.slice(0, 600);
  const orgPat = /(?:organization|agency|borrower)\s*[:\-]?\s*([a-z0-9,&.\- ]{3,100})/i;
  const org = body.match(orgPat)?.[1]?.trim() || "";
  return {
    title, organization: org, type: "other", location: extractLocation(body),
    deadline: normalizeDateString(extractDeadline(body)), postedDate: extractPostedDate(body),
    url, sourceDomain: new URL(url).hostname, summary, parserConfidence: confidence,
    parserSource: `domain:${label}`
  };
}

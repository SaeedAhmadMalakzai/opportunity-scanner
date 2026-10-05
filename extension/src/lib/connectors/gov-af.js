import { splitBlocks, stripHtml, anchors, extractAfghanLocation } from "../html.js";
import { normalizeAnyDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";

/**
 * Afghan ministry websites share one Drupal theme ("cyberaan"): every notice is a bootstrap card with a
 * `.card-date-blue` header, an `h2.card-title a` link and a `.card-text` teaser.
 */
const CARD = /<div class="card ?">/g;

export function parseGovAfCards(html, { baseUrl, organization, sourceDomain, parserSource }) {
  const items = [];
  const seen = new Set();
  for (const block of splitBlocks(html, CARD)) {
    const titleHtml = block.match(/<h2 class="card-title">([\s\S]*?)<\/h2>/i)?.[1];
    if (!titleHtml) continue;
    const link = anchors(titleHtml)[0];
    if (!link) continue;
    const url = resolveHttpUrl(link.href, baseUrl);
    const title = stripHtml(link.inner);
    if (!url || title.length < 4 || seen.has(url)) continue;
    seen.add(url);
    const header = block.match(/class="d-flex card-date-blue">\s*<span>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
    const postedDate = normalizeAnyDate(stripHtml(header?.[1] || ""));
    const place = stripHtml(header?.[2] || "");
    const teaser = stripHtml(block.match(/<p class="card-text">([\s\S]*?)<\/div>/i)?.[1] || "");
    items.push({
      title: title.slice(0, 200), organization, type: "tender",
      location: place || extractAfghanLocation(`${title} ${teaser}`) || "Afghanistan",
      deadline: null, postedDate, url, sourceDomain,
      summary: [organization, teaser || title].filter(Boolean).join(" · ").slice(0, 400),
      parserConfidence: 0.86, parserSource
    });
  }
  return items;
}

const MINISTRIES = [
  { id: "govaf-moi", short: "MoI", org: "Ministry of Interior Affairs", domain: "moi.gov.af", urls: ["https://moi.gov.af/dr/all-tenders", "https://moi.gov.af/en/all-tenders"] },
  { id: "govaf-moe", short: "MoE", org: "Ministry of Education", domain: "moe.gov.af", urls: ["https://www.moe.gov.af/ps/all-tenders", "https://www.moe.gov.af/en/all-tenders"] },
  { id: "govaf-mew", short: "MEW", org: "Ministry of Energy and Water", domain: "mew.gov.af", urls: ["https://mew.gov.af/en/all-tenders", "https://mew.gov.af/dr/all-tenders"] },
  { id: "govaf-mopw", short: "MoPW", org: "Ministry of Public Works", domain: "mopw.gov.af", urls: ["https://www.mopw.gov.af/all-tenders", "https://www.mopw.gov.af/en/all-tenders"] },
  { id: "govaf-momp", short: "MoMP", org: "Ministry of Mines and Petroleum", domain: "momp.gov.af", urls: ["https://momp.gov.af/all-tenders"] },
  { id: "govaf-mcit", short: "MCIT", org: "Ministry of Communications and IT", domain: "mcit.gov.af", urls: ["https://mcit.gov.af/en/all-tenders"] },
  { id: "govaf-moec", short: "MoEc", org: "Ministry of Economy", domain: "moec.gov.af", urls: ["https://www.moec.gov.af/en/all-tenders", "https://www.moec.gov.af/all-tenders"] },
  { id: "govaf-molsa", short: "MoLSA", org: "Ministry of Labour and Social Affairs", domain: "molsa.gov.af", urls: ["https://molsa.gov.af/all-tenders", "https://molsa.gov.af/en/all-tenders"] },
  { id: "govaf-mohia", short: "MoHIA", org: "Ministry of Hajj and Religious Affairs", domain: "mohia.gov.af", urls: ["https://www.mohia.gov.af/en/all-tenders"] }
];

export const GOV_AF_HOSTS = MINISTRIES.flatMap((m) => m.urls.map((u) => `${new URL(u).origin}/*`));

async function fetchMinistry(ctx, m) {
  const all = [];
  const seen = new Set();
  let lastError = null;
  for (const url of m.urls) {
    try {
      const items = parseGovAfCards(await ctx.fetchText(url), { baseUrl: url, organization: m.org, sourceDomain: m.domain, parserSource: `html:${m.id}` });
      for (const it of items) if (!seen.has(it.url)) { seen.add(it.url); all.push(it); }
    } catch (e) { lastError = e; }
  }
  if (!all.length && lastError) throw lastError;
  return all;
}

export const govAfConnectors = Object.fromEntries(MINISTRIES.map((m) => [m.id, {
  label: `${m.short} — ${m.org} tenders`,
  description: `Official tender notices from the ${m.org} of Afghanistan (${m.domain}). Dari/Pashto dates are converted from the Solar Hijri calendar.`,
  homepage: m.urls[0],
  group: "Afghan government",
  fetchItems: (ctx) => fetchMinistry(ctx, m)
}]));

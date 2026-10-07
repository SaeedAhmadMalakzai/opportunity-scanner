import { splitBlocks, stripHtml, anchors, extractAfghanLocation } from "../html.js";
import { normalizeDate } from "../dates.js";
import { resolveHttpUrl } from "../urls.js";
import { OPPORTUNITY_TYPES } from "../types.js";
import { htmlConnector, TITLE_MAX, SUMMARY_MAX } from "./shared.js";

const BASE = "https://www.acted.org/";
const ITEM = /<div class="item item-rh">/g;

const ACTED_COUNTRIES = /^(afghanistan|armenia|bangladesh|burkina faso|car|central african republic|chad|colombia|drc|rdc|ethiopia|haiti|iraq|jordan|kenya|kyrgyzstan|lebanon|libya|mali|moldova|myanmar|niger|nigeria|opt|occupied palestinian territories?|pakistan|philippines|poland|somalia|south sudan|sri lanka|sudan|syria|tajikistan|tunisia|turkey|türkiye|uganda|ukraine|uzbekistan|venezuela|yemen)$/i;

function locationFromTitle(title) {
  const parts = title.split(/\s*[_–—-]\s*/).map((s) => s.trim());
  const country = parts.slice(1).find((p) => ACTED_COUNTRIES.test(p));
  return country || extractAfghanLocation(title);
}

export function parseActedTenders(html) {
  const items = [];
  for (const block of splitBlocks(html, ITEM)) {
    const link = anchors(block).find((a) => /class="title"/.test(a.attrs));
    if (!link) continue;
    const url = resolveHttpUrl(link.href, BASE);
    const title = stripHtml(link.inner);
    if (!url || title.length < 8) continue;
    const posted = normalizeDate(block.match(/<div class="float-right">\s*([\d\/.\-]+)\s*<\/div>/i)?.[1] || "");
    const location = locationFromTitle(title) || "";
    items.push({
      title: title.slice(0, TITLE_MAX), organization: "ACTED", type: OPPORTUNITY_TYPES.TENDER,
      location, offTarget: Boolean(location) && !/afghanistan/i.test(location),
      deadline: null, postedDate: posted, url, sourceDomain: "acted.org",
      summary: title.slice(0, SUMMARY_MAX), parserConfidence: 0.88, parserSource: "html:acted"
    });
  }
  return items;
}

export const actedConnectors = {
  "acted-tenders": htmlConnector({
    label: "ACTED — Calls for tenders (global)",
    description: "ACTED's international and national calls for tenders. Mostly outside Afghanistan; Afghan notices are boosted by geography scoring.",
    homepage: "https://www.acted.org/en/call-for-tenders/",
    parse: parseActedTenders
  })
};

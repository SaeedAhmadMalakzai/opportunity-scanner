import { parseHtmlListingPage } from "./parsers.js";

function strip(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/* ── ACBAR ── */

function parseAcbarTable(html, type) {
  const items = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const linkMatch = row.match(/<a[^>]+href="(\/site-rfq\/\d+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = `https://www.acbar.org${linkMatch[1]}`;
    const title = strip(linkMatch[2]);
    if (title.length < 5) continue;
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const org = cells[2] ? strip(cells[2]) : "";
    const deadline = cells[3] ? strip(cells[3]) : null;
    items.push({
      title, organization: org, type, location: "Afghanistan",
      deadline, postedDate: null, url: href, sourceDomain: "acbar.org",
      summary: `${title} — ${org}`.slice(0, 400),
      parserConfidence: 0.93, parserSource: "html:acbar"
    });
  }
  return items;
}

/* ── World Bank ── */

function parseWorldBankResponse(json) {
  const items = [];
  const projects = json?.projects || {};
  for (const key of Object.keys(projects)) {
    const p = projects[key];
    if (!p) continue;
    items.push({
      title: p.project_name || "Untitled", organization: "World Bank",
      type: "project", location: p.countryname || "Afghanistan",
      deadline: p.closingdate || null, postedDate: p.boardapprovaldate || null,
      url: `https://projects.worldbank.org/en/projects-operations/project-detail/${p.id || key}`,
      sourceDomain: "worldbank.org",
      summary: String(p.project_abstract?.cdata || "").slice(0, 600),
      parserConfidence: 0.92, parserSource: "api:worldbank"
    });
  }
  return items;
}

/* ── UNDP ── */

function parseUndpHtml(html) {
  const items = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const linkMatch = row.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    let href = linkMatch[1];
    const title = strip(linkMatch[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `https://procurement-notices.undp.org${href}`;
    if (!href.startsWith("http")) continue;
    const dl = row.match(/(\d{1,2}[-\/]\w{3}[-\/]\d{2,4})/i);
    items.push({
      title, organization: "UNDP", type: "tender", location: "Afghanistan",
      deadline: dl?.[1] || null, postedDate: null, url: href,
      sourceDomain: "undp.org", summary: strip(row).slice(0, 400),
      parserConfidence: 0.8, parserSource: "html:undp"
    });
  }
  return items;
}

/* ── UNGM ── */

function parseUngmHtml(html) {
  const items = [];
  const links = html.match(/<a[^>]+href="([^"]*Notice[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi) || [];
  for (const link of links) {
    const m = link.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    let href = m[1];
    const title = strip(m[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `https://www.ungm.org${href}`;
    if (!href.startsWith("http")) continue;
    items.push({
      title, organization: "United Nations", type: "tender", location: "",
      deadline: null, postedDate: null, url: href, sourceDomain: "ungm.org",
      summary: title, parserConfidence: 0.7, parserSource: "html:ungm"
    });
  }
  return items;
}

/* ── ReliefWeb ── */

function parseReliefWebHtml(html, baseType) {
  const items = [];
  const articles = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
  for (const article of articles) {
    const lm = article.match(/<a[^>]+href="([^"]*\/(?:report|job|training)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!lm) continue;
    let href = lm[1];
    const title = strip(lm[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `https://reliefweb.int${href}`;
    const srcM = article.match(/class="[^"]*source[^"]*"[^>]*>([\s\S]*?)<\//i);
    const dtM = article.match(/datetime="([^"]+)"/i) || article.match(/(20\d{2}-\d{2}-\d{2})/);
    items.push({
      title, organization: srcM ? strip(srcM[1]) : "", type: baseType,
      location: "Afghanistan", deadline: null, postedDate: dtM?.[1] || null,
      url: href, sourceDomain: "reliefweb.int", summary: strip(article).slice(0, 500),
      parserConfidence: 0.88, parserSource: "html:reliefweb"
    });
  }
  if (items.length === 0) {
    const rx = /<a[^>]+href="(https:\/\/reliefweb\.int\/(?:report|job|training)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = rx.exec(html)) !== null) {
      const t = strip(m[2]);
      if (t.length < 10) continue;
      items.push({
        title: t, organization: "", type: baseType, location: "Afghanistan",
        deadline: null, postedDate: null, url: m[1], sourceDomain: "reliefweb.int",
        summary: t, parserConfidence: 0.75, parserSource: "html:reliefweb"
      });
    }
  }
  return items.slice(0, 50);
}

/* ── UNJobs ── */

function parseUnjobsHtml(html) {
  const items = [];
  const links = html.match(/<a[^>]+href="(\/[^"]*)"[^>]*class="[^"]*unjobs[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)
    || html.match(/<a[^>]+href="(\/en\/opportunities\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
    || [];
  if (links.length === 0) {
    const rx = /<a[^>]+href="(https?:\/\/[^"]*unjobs[^"]*\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = rx.exec(html)) !== null) {
      const t = strip(m[2]);
      if (t.length < 10) continue;
      items.push({
        title: t, organization: "United Nations", type: "consultancy",
        location: "Afghanistan", deadline: null, postedDate: null,
        url: m[1], sourceDomain: "unjobs.org", summary: t,
        parserConfidence: 0.7, parserSource: "html:unjobs"
      });
    }
  }
  for (const link of links) {
    const m = link.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!m) continue;
    let href = m[1];
    const title = strip(m[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `https://unjobs.org${href}`;
    if (!href.startsWith("http")) continue;
    items.push({
      title, organization: "United Nations", type: "consultancy",
      location: "Afghanistan", deadline: null, postedDate: null,
      url: href, sourceDomain: "unjobs.org", summary: title,
      parserConfidence: 0.75, parserSource: "html:unjobs"
    });
  }
  return items.length ? items : parseHtmlListingPage(html, "https://unjobs.org", "unjobs.org", "consultancy");
}

/* ── Generic UN agency listing parser ── */

function parseUnAgencyHtml(html, baseUrl, domain, org, type) {
  const items = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const lm = row.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!lm) continue;
    let href = lm[1];
    const title = strip(lm[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `${baseUrl}${href}`;
    if (!href.startsWith("http")) continue;
    const dl = row.match(/(\d{1,2}[-\/]\w{3,9}[-\/]\d{2,4})/i)
      || row.match(/(20\d{2}-\d{2}-\d{2})/);
    items.push({
      title, organization: org, type, location: "Afghanistan",
      deadline: dl?.[1] || null, postedDate: null, url: href,
      sourceDomain: domain, summary: strip(row).slice(0, 400),
      parserConfidence: 0.78, parserSource: `html:${domain}`
    });
  }
  if (items.length === 0) {
    return parseHtmlListingPage(html, baseUrl, domain, type);
  }
  return items;
}

/* ── Afghan Tenders ── */

function parseAfghanTendersHtml(html) {
  const items = [];
  const blocks = html.match(/<(?:div|article|section)[^>]*>[\s\S]*?(?:Closing date|closing date)\s*[:：]?\s*([\d\-]+)[\s\S]*?<\/(?:div|article|section)>/gi) || [];
  for (const block of blocks) {
    const lm = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!lm) continue;
    let href = lm[1];
    const title = strip(lm[2]);
    if (title.length < 10) continue;
    if (href.startsWith("/")) href = `https://www.afghantenders.com${href}`;
    if (!href.startsWith("http")) continue;
    const dlMatch = block.match(/Closing date\s*[:：]?\s*([\d\-]+)/i);
    const locMatch = block.match(/\|\s*([A-Za-z, ]+?)\s*\|/);
    items.push({
      title, organization: "", type: "tender",
      location: locMatch?.[1]?.trim() || "Afghanistan",
      deadline: dlMatch?.[1] || null, postedDate: null, url: href,
      sourceDomain: "afghantenders.com", summary: strip(block).slice(0, 400),
      parserConfidence: 0.85, parserSource: "html:afghantenders"
    });
  }
  if (items.length === 0) {
    const rx = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = rx.exec(html)) !== null) {
      const t = strip(m[2]);
      if (t.length < 15) continue;
      if (/tender|rfq|rfp|bid|itb|eoi|procurement|supply|provision/i.test(t)) {
        let href = m[1];
        if (href.startsWith("/")) href = `https://www.afghantenders.com${href}`;
        if (!href.startsWith("http")) continue;
        items.push({
          title: t.slice(0, 200), organization: "", type: "tender",
          location: "Afghanistan", deadline: null, postedDate: null,
          url: href, sourceDomain: "afghantenders.com", summary: t,
          parserConfidence: 0.7, parserSource: "html:afghantenders-fallback"
        });
      }
    }
  }
  return items.slice(0, 50);
}

/* ═══════════ CONNECTOR REGISTRY ═══════════ */

const CONNECTORS = {
  "acbar-rfp": {
    label: "ACBAR RFPs (Afghanistan)",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.acbar.org/site-rfq?r=Request%20for%20Proposal");
      return parseAcbarTable(html, "tender");
    }
  },
  "acbar-rfq": {
    label: "ACBAR RFQs (Afghanistan)",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.acbar.org/site-rfq?r=Request%20for%20Quotation");
      return parseAcbarTable(html, "tender");
    }
  },
  "reliefweb-jobs": {
    label: "ReliefWeb Jobs (Afghanistan)",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://reliefweb.int/jobs?advanced-search=%28C13%29");
      return parseReliefWebHtml(html, "consultancy");
    }
  },
  "reliefweb-training": {
    label: "ReliefWeb Training (Afghanistan)",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://reliefweb.int/training?advanced-search=%28C13%29");
      return parseReliefWebHtml(html, "training");
    }
  },
  "worldbank-projects": {
    label: "World Bank Projects (Afghanistan)",
    async fetchItems(ctx) {
      const data = await ctx.fetchJson("https://search.worldbank.org/api/v2/projects?format=json&countrycode_exact=AF&rows=50&os=0&apilang=en");
      return parseWorldBankResponse(data);
    }
  },
  "undp-procurement": {
    label: "UNDP Procurement (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://procurement-notices.undp.org/view_notices.cfm?static=no&country=AFG",
        "https://procurement-notices.undp.org/view_notices.cfm?country=AFG",
        "https://www.undp.org/afghanistan/procurement"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUndpHtml(html);
          if (items.length > 0) return items;
          const fb = parseHtmlListingPage(html, url, "undp.org", "tender");
          if (fb.length > 0) return fb;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "ungm-tenders": {
    label: "UNGM Tenders",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.ungm.org/Public/Notice");
      return parseUngmHtml(html);
    }
  },
  "unjobs-af": {
    label: "UNJobs Afghanistan",
    async fetchItems(ctx) {
      const urls = [
        "https://unjobs.org/duty_stations/afghanistan",
        "https://unjobs.org/duty_stations/kabul"
      ];
      const all = [];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          all.push(...parseUnjobsHtml(html));
        } catch { /* next */ }
      }
      return all;
    }
  },
  "unwomen-procurement": {
    label: "UN Women Procurement",
    async fetchItems(ctx) {
      const urls = [
        "https://www.unwomen.org/en/about-us/procurement",
        "https://www.unwomen.org/en/about-us/procurement/current-procurement-opportunities"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, "https://www.unwomen.org", "unwomen.org", "UN Women", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "unops-opportunities": {
    label: "UNOPS Jobs & Procurement",
    async fetchItems(ctx) {
      const urls = [
        "https://jobs.unops.org/Pages/ViewVacancies/All.aspx",
        "https://www.unops.org/business-opportunities"
      ];
      const all = [];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          all.push(...parseUnAgencyHtml(html, new URL(url).origin, new URL(url).hostname, "UNOPS", "consultancy"));
        } catch { /* next */ }
      }
      return all;
    }
  },
  "wfp-procurement": {
    label: "WFP Procurement (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://www.wfp.org/procurement/food-procurement",
        "https://www.ungm.org/Public/Notice?isArchived=false&organizationId=19"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const domain = new URL(url).hostname;
          if (domain.includes("ungm")) {
            const items = parseUngmHtml(html);
            if (items.length > 0) return items.map((it) => ({ ...it, organization: "WFP" }));
          }
          const items = parseUnAgencyHtml(html, new URL(url).origin, domain, "WFP", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "unicef-supply": {
    label: "UNICEF Supply & Procurement",
    async fetchItems(ctx) {
      const urls = [
        "https://www.unicef.org/supply/contracts-and-consultancies",
        "https://www.ungm.org/Public/Notice?isArchived=false&organizationId=4"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const domain = new URL(url).hostname;
          if (domain.includes("ungm")) {
            const items = parseUngmHtml(html);
            if (items.length > 0) return items.map((it) => ({ ...it, organization: "UNICEF" }));
          }
          const items = parseUnAgencyHtml(html, new URL(url).origin, domain, "UNICEF", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "fao-procurement": {
    label: "FAO Procurement (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://www.fao.org/unfao/procurement/calls/en/",
        "https://www.ungm.org/Public/Notice?isArchived=false&organizationId=15"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const domain = new URL(url).hostname;
          if (domain.includes("ungm")) {
            const items = parseUngmHtml(html);
            if (items.length > 0) return items.map((it) => ({ ...it, organization: "FAO" }));
          }
          const items = parseUnAgencyHtml(html, new URL(url).origin, domain, "FAO", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "iom-procurement": {
    label: "IOM Procurement (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://afghanistan.iom.int/procurement",
        "https://www.iom.int/procurement-opportunities"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, new URL(url).origin, new URL(url).hostname, "IOM", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "afghantenders": {
    label: "Afghan Tenders (All Afghanistan)",
    async fetchItems(ctx) {
      const html = await ctx.fetchText("https://www.afghantenders.com/");
      return parseAfghanTendersHtml(html);
    }
  },
  "tendersontime-af": {
    label: "Tenders On Time (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://www.tendersontime.com/afghanistan-tenders/",
        "https://www.tendersontime.com/afghanistan-tenders/consultancy-tenders/"
      ];
      const all = [];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          all.push(...parseHtmlListingPage(html, "https://www.tendersontime.com", "tendersontime.com", "tender"));
        } catch { /* next */ }
      }
      return all;
    }
  },
  "acted-tenders": {
    label: "ACTED Tenders (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://www.acted.org/en/tenders/",
        "https://www.acted.org/en/opportunities/"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, "https://www.acted.org", "acted.org", "ACTED", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "akdn-procurement": {
    label: "AKDN / Aga Khan (Afghanistan)",
    async fetchItems(ctx) {
      const urls = [
        "https://the.akdn/en/resources-media/procurement",
        "https://www.akdn.org/where-we-work/south-asia/afghanistan"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, new URL(url).origin, new URL(url).hostname, "Aga Khan / AKDN", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "care-procurement": {
    label: "CARE International Procurement",
    async fetchItems(ctx) {
      const urls = [
        "https://www.care-international.org/tenders-consultancies",
        "https://www.care.org/procurement/"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, new URL(url).origin, new URL(url).hostname, "CARE International", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  },
  "actionaid-procurement": {
    label: "ActionAid Procurement",
    async fetchItems(ctx) {
      const urls = [
        "https://www.actionaid.org/procurement",
        "https://afghanistan.actionaid.org/tenders"
      ];
      for (const url of urls) {
        try {
          const html = await ctx.fetchText(url);
          const items = parseUnAgencyHtml(html, new URL(url).origin, new URL(url).hostname, "ActionAid", "tender");
          if (items.length > 0) return items;
        } catch { /* next */ }
      }
      return [];
    }
  }
};

export function getConnectorCatalog() {
  return Object.entries(CONNECTORS).map(([id, c]) => ({ id, label: c.label }));
}

export async function fetchAllConnectorItems(ctx, { onProgress, shouldAbort } = {}) {
  const enabled = ctx.settings.enabledSources || [];
  ctx.log(`Enabled sources: ${enabled.join(", ") || "(none)"}`);
  const total = enabled.length;
  let done = 0;
  const health = {};
  const all = [];
  for (const id of enabled) {
    if (shouldAbort?.()) { ctx.log("Scan aborted by user"); break; }
    const c = CONNECTORS[id];
    if (!c) { ctx.log(`SKIP unknown: ${id}`); done++; continue; }
    onProgress?.({ sourceId: id, source: c.label, done, total, phase: "fetching" });
    const t0 = Date.now();
    try {
      const items = await c.fetchItems(ctx);
      const ms = Date.now() - t0;
      ctx.log(`${c.label}: ${items.length} items (${ms}ms)`);
      all.push(...items);
      health[id] = { status: "ok", count: items.length, ms, at: new Date().toISOString(), error: null };
    } catch (err) {
      const ms = Date.now() - t0;
      const isTimeout = ms >= (ctx.settings.fetchTimeoutMs || 25000) - 500;
      const isSlow = ms > 10000;
      ctx.log(`${c.label}: ERROR - ${err.message} (${ms}ms)`);
      health[id] = { status: "error", count: 0, ms, at: new Date().toISOString(), error: err.message, isTimeout, isSlow };
    }
    done++;
    onProgress?.({ sourceId: id, source: c.label, done, total, phase: "fetching", items: all.length });
  }
  return { items: all, health };
}

# Opportunity Scanner

Chrome extension (Manifest V3) that finds tenders, RFPs, RFQs, consultancies, projects and trainings in Afghanistan, scores each notice against a consulting-services profile, and gives you a fast triage inbox. Everything runs and stays inside your browser.

This repository is the extension source only. Load the `extension` folder via **Load unpacked** in `chrome://extensions`.

## Install

1. Open Google Chrome 110 or newer.
2. Go to `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.
4. Pin the icon, open the popup, and press **Scan**.

## How it works

1. **Scan** fetches every enabled source in parallel (typically 5–10 seconds for all of them).
2. Each notice is parsed into a common shape (title, organisation, deadline, posted date, location, summary).
3. Expired deadlines, duplicates and notices you have already seen are dropped.
4. The rest are scored 0–100 against built-in consulting terms (project management, M&E, HR, training, capacity building…) plus your custom keywords, target geographies and freshness.
5. Notices land in the popup inbox where you search, filter, sort, save, dismiss, annotate and export.

## Sources

| Source | What it fetches | Method |
|--------|-----------------|--------|
| ACBAR — RFPs | Requests for proposals on Afghanistan's NGO coordination body | HTML |
| ACBAR — RFQs | Requests for quotations and ITBs | HTML |
| ACBAR — Jobs & consultancies | The largest NGO job board in Afghanistan | HTML |
| UNGM — all UN agencies (Afghanistan) | Live notices from UNDP, UNICEF, WFP, FAO, IOM, UNOPS, UN Women, UNHCR, WHO and others on the UN Global Marketplace | Search API |
| World Bank — procurement notices | Open bids and expressions of interest under Bank-financed projects (contract awards filtered out) | Official API |
| World Bank — projects | Active and pipeline projects in Afghanistan | Official API |
| Afghan Tenders | Afghanistan's largest tender aggregator | HTML |
| ACTED — calls for tenders | ACTED's global tenders (notices outside Afghanistan are scored down) | HTML |
| ActionAid Afghanistan | Vacancies, consultancies and tenders from the country office | HTML |
| ReliefWeb — jobs | Jobs and consultancies filtered to Afghanistan | Official API, needs a free appname |
| ReliefWeb — training | Training opportunities filtered to Afghanistan | Official API, needs a free appname |
| UNAMA — expressions of interest | Current EOIs from the UN Assistance Mission in Afghanistan | HTML table |
| UNDP Afghanistan — projects | Country programme projects (UNDP tenders are on UNGM) | HTML |
| Afghan ministries (9) | Official tender notices from MoI, MoE, MEW, MoPW, MoMP, MCIT, MoEc, MoLSA and MoHIA | HTML, one shared parser; Solar Hijri dates converted |

ReliefWeb requires a pre-approved `appname` for API access since November 2025. Request one at <https://apidoc.reliefweb.int/parameters#appname>, paste it into **Settings → Sources**, and both ReliefWeb sources start working.

You can also add your own listing pages to crawl and individual notice pages to parse under **Settings → Your own sources**. Chrome asks once for permission to read each new site.

### Sources that were checked and cannot be scraped

- **AGEOPS** (tenders.ageops.af): a login-only Angular app with no public API.
- **UNICEF Afghanistan** and **dgMarket**: Cloudflare browser challenge blocks background fetches.
- **UNDP Afghanistan procurement** and **FAO procurement**: information pages without a notice list; both publish on UNGM, which is covered.
- **Ministry of Finance** and **Ministry of Defence**: expired or broken TLS certificates, so Chrome refuses the connection.

### Why some old sources were removed

Version 4.1 replaced the connector layer after an audit found that most of the previous twenty sources returned nothing or returned navigation links instead of notices. Pages that no longer exist (UNDP procurement-notices, FAO, CARE, AKDN, ActionAid global), sites behind bot challenges (UNJobs, Tenders On Time, UNICEF, IOM) and JavaScript-only portals (UNOPS careers) were dropped. The UN agencies now come through UNGM, where they actually publish.

## Popup

- **Segmented inbox**: Active, New, Saved, Dismissed with live counts.
- **Search** across title, organisation, summary and your notes. Press `/` to focus.
- **Filters**: type, sort (best match, deadline, recently found, source), minimum score, keyword, source.
- **Cards**: score ring, deadline urgency (due today / 3 days / 7 days), posted age, duplicate cluster size, matched keywords, private note.
- **Actions**: save, dismiss, note, copy link, open. Every status change shows an **Undo** toast.
- **Bulk**: select cards (or `x`), then save, dismiss or export the selection as CSV.
- **Keyboard**: `j`/`k` move, `s` save, `d` dismiss, `o` or Enter open, `x` select, `r` scan, `e` export, Esc clear.
- **Live scan panel** with per-source progress, elapsed time and a Stop button; partial results are kept.
- Light and dark themes, compact and comfortable density, reduced-motion aware.

## Settings

- Enable or disable each source, see its health from the last scan (items, time, error), and **Test** a single source.
- Custom keywords (+15 each), target geographies (+10), minimum score, notification threshold.
- Your own listing pages and notice URLs (https only, validated inline).
- Scan interval, per-request timeout and parallelism.
- Delete all stored data.

## Scoring

| Signal | Points |
|--------|--------|
| High-weight term (project management, M&E, capacity building…) | +20 each |
| Medium-weight term (consultancy, training, research, audit…) | +10 each |
| Custom keyword | +15 each |
| High-weight term in the title | +15 |
| Target geography matched | +10 |
| Notice flagged by its source as outside Afghanistan | −25 |
| Tender, consultancy or training type | +10 |
| Posted within 7 days / 30 days | +10 / +5 |
| Negative term (fuel supply, construction, vehicles…) | −20 each |
| Parser confidence | up to +8 |

Scores are clamped to 0–100. Terms are matched on word boundaries, so `meal` does not match `mealtime`.

## Development

```bash
npm test          # unit tests (node:test, no dependencies) incl. parsers against real saved pages
npm run check     # syntax check of every module
npm run smoke     # loads the extension in headless Chrome for Testing, runs a live scan, screenshots popup + options
```

The smoke test needs a Chrome for Testing or Chromium build (branded Google Chrome 137+ no longer accepts `--load-extension`). It picks one up from Playwright's cache automatically, or set `CHROME_BIN`. Output lands in `tests/smoke/out/`.

Layout:

```
extension/
  manifest.json
  src/background/service-worker.js   scan orchestration, messaging, alarms, keep-alive
  src/lib/connectors/                one module per source + registry with bounded parallelism
  src/lib/scan.js                    pure pipeline: dedupe, expiry, scoring, clustering, filtering, CSV
  src/lib/matcher.js                 scoring profile
  src/lib/storage.js                 chrome.storage.local access with cache, pruning, migrations
  src/lib/{html,dates,urls,parsers}.js
  src/popup/                         inbox UI
  src/options/                       settings UI
  src/styles/tokens.css              shared design tokens (light/dark)
tests/                               unit tests, fixtures (trimmed real pages), smoke harness
```

## Privacy

No analytics, no remote server, no cookies of its own. See [extension/PRIVACY_POLICY.md](extension/PRIVACY_POLICY.md).

## License

MIT — see [LICENSE](LICENSE).

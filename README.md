# Opportunity Scanner

Chrome extension (Manifest V3) that discovers tenders, RFPs, RFQs, projects, trainings, and consultancy opportunities in Afghanistan from UN agencies, ACBAR, World Bank, and other public sources.

This repository is the extension source only: load the `extension` folder via **Load unpacked** in `chrome://extensions`.

## Installation

1. Open **Google Chrome** (version 110 or newer)
2. Go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `extension` folder from this package
6. The extension icon will appear in your Chrome toolbar

## How to Use

1. Click the **extension icon** in the toolbar to open the popup
2. Click **Scan Now** to fetch opportunities from all enabled sources
3. Browse results — each card shows the title, score, type, source, and deadline
4. Use the **Type**, **Status**, and **Min Score** filters to narrow results
5. Click **Save** to bookmark an opportunity, or **Dismiss** to hide it
6. Click the **total / new / saved** badges at the top to quick-filter
7. Click **Export** to download results as a CSV file
8. Click **Settings** at the bottom to configure sources, keywords, and scan schedule

## Sources (20 Connectors)

| Source | What it fetches |
|--------|----------------|
| ACBAR RFPs | Request for Proposals from Afghan NGO coordination body |
| ACBAR RFQs | Request for Quotations from NGOs in Afghanistan |
| ReliefWeb Jobs | Consultancy and job positions in Afghanistan |
| ReliefWeb Training | Training and learning opportunities |
| World Bank Projects | Active development projects in Afghanistan |
| UNDP Procurement | Procurement notices and tenders |
| UNGM Tenders | UN Global Marketplace tenders |
| UNJobs | UN job vacancies and consultancies in Afghanistan |
| UN Women | Procurement related to gender equality projects |
| UNOPS | UN Office for Project Services opportunities |
| WFP | World Food Programme procurement |
| UNICEF Supply | Contracts and consultancies for children |
| FAO Procurement | Food and Agriculture Organization tenders |
| IOM Procurement | Migration organization tenders in Afghanistan |
| Afghan Tenders | Largest Afghan tender aggregator — RFQs, RFPs, ITBs |
| Tenders On Time | International tender portal with Afghanistan listings |
| ACTED | Agency for Technical Cooperation and Development tenders |
| AKDN / Aga Khan | Aga Khan Development Network procurement |
| CARE International | Humanitarian tenders and consultancies |
| ActionAid | International NGO procurement and tenders |

## Features

- **20 direct source connectors** — no search engine scraping
- **Expired deadline filtering** — past-deadline items automatically excluded
- **Smart keyword scoring** — weighted matching against company profile
- **Duplicate clustering** — groups similar listings across sources
- **High-priority notifications** — desktop alerts for strong matches
- **CSV export** — download filtered results with all metadata
- **Scheduled scans** — configurable auto-scanning (default: every 12 hours)
- **Local-only storage** — all data stays in your browser, nothing is sent anywhere
- **Clickable stat badges** — quick-filter by All / New / Saved
- **Hover tooltips** — every UI element explains itself on hover

## Settings

Open Settings from the popup footer to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Minimum Score | 0 | Hide results below this relevance score |
| Scan Interval | 12 hours | How often automatic background scans run |
| High Priority Threshold | 80 | Score that triggers a desktop notification |
| Target Geographies | afghanistan, kabul, herat, ... | Locations that boost an item's score |
| Fetch Timeout | 25 seconds | Max wait per network request |
| Max Concurrent Fetches | 3 | Parallel request limit |
| Custom Keywords | (empty) | Your own keywords — each match adds +15 to score |
| Manual Links | (empty) | Direct URLs to individual tender/project pages |
| Custom Source URLs | (empty) | Additional listing pages to crawl for links |
| Enabled Sources | All 20 | Toggle individual connectors on/off |

## Privacy

All data is stored locally in your browser. The extension does not collect, transmit, or share any personal information. See `extension/PRIVACY_POLICY.md` for the full privacy policy.

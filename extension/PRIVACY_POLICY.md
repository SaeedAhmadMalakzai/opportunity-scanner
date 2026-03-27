# Privacy Policy for Opportunity Scanner

**Last updated:** March 27, 2026

## Overview

Opportunity Scanner is a Chrome extension that discovers publicly available tenders, projects, RFPs, RFQs, and training opportunities from UN agencies, ACBAR, World Bank, and other sources relevant to Afghanistan.

## Data Collection

This extension does **not** collect, transmit, or share any personal information.

- Does **not** track browsing history or user activity outside its own scans.
- Does **not** use cookies or tracking technologies.
- Does **not** collect names, emails, IP addresses, or any personally identifiable information.
- Does **not** send data to external servers owned by the developer.

## Data Storage

All data is stored locally via `chrome.storage.local`:

- Opportunity records (title, URL, summary, score, metadata from public pages).
- User settings (scan interval, score threshold, enabled sources).
- Scan state (timestamps, counters).
- Seen URLs index (deduplication).

No data leaves the browser. There is no remote database, analytics, or cloud sync.

## Network Requests

The extension makes HTTPS requests only to publicly available, non-authenticated pages on:

- **ACBAR** (`acbar.org`) — RFPs and RFQs
- **ReliefWeb** (`reliefweb.int`) — jobs and training
- **World Bank** (`search.worldbank.org`) — project data API
- **UNDP** (`procurement-notices.undp.org`, `undp.org`) — procurement notices
- **UNGM** (`ungm.org`) — UN Global Marketplace tenders
- **UNJobs** (`unjobs.org`) — UN job vacancies
- **UN Women** (`unwomen.org`) — procurement
- **UNOPS** (`unops.org`, `jobs.unops.org`) — opportunities
- **WFP** (`wfp.org`) — procurement
- **UNICEF** (`unicef.org`) — supply and contracts
- **FAO** (`fao.org`) — procurement calls
- **IOM** (`iom.int`) — procurement
- **Afghan Tenders** (`afghantenders.com`) — Afghan tender aggregator
- **Tenders On Time** (`tendersontime.com`) — international tender portal
- **ACTED** (`acted.org`) — NGO tenders
- **AKDN** (`akdn.org`, `the.akdn`) — Aga Khan Development Network procurement
- **CARE International** (`care-international.org`, `care.org`) — humanitarian procurement
- **ActionAid** (`actionaid.org`) — NGO procurement

Additionally, user-configured custom URLs may be fetched.

## Permissions

| Permission       | Reason                                                    |
|------------------|-----------------------------------------------------------|
| `storage`        | Store opportunity records and settings locally            |
| `alarms`         | Schedule periodic background scans                        |
| `notifications`  | Alert user when a high-priority opportunity is found      |
| Host permissions | Fetch public pages from source domains and custom URLs    |

## User Control

- Configure enabled sources in Settings.
- Clear all stored data via "Clear All Data" in Settings.
- Uninstalling the extension removes all local data.

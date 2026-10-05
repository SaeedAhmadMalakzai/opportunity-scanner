# Privacy Policy for Opportunity Scanner

**Last updated:** October 5, 2026

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

The extension only contacts the publishers it scans, directly from your browser:

- `www.acbar.org`
- `www.ungm.org`
- `search.worldbank.org` and `projects.worldbank.org`
- `www.afghantenders.com`
- `www.acted.org`
- `afghanistan.actionaid.org`
- `api.reliefweb.int` (only when you configure a ReliefWeb appname)
- any listing or notice URLs you add yourself in Settings (Chrome asks for permission per site)

Requests are plain HTTPS reads of public pages. For UNGM the extension fetches the public notice page and then calls the site's own search endpoint with the anti-forgery token that page provides, exactly as the website itself does. No request carries any information about you beyond what your browser normally sends.

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

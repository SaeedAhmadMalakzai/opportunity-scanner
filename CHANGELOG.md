# Changelog

## 4.4.0 — 2026-10-07

Dual-model re-audit: Fable 5.1 for security, Opus 5.5 for code quality. Both reports were read-only; fixes were then applied and verified (136 unit tests, live smoke clean).

### Security (Fable 5.1 audit)
- **High — regex denial of service.** Every HTML parser used lazy `[\s\S]*?` spans and `[^>]` attribute runs, which are quadratic or cubic on pages full of openers with no closers. Measured: a 100 KB hostile page froze the service worker for minutes and would have re-frozen it every scheduled scan. All parsing now runs in linear time: opening tags are matched with `[^<>]`-bounded regexes and closing tags are found with `indexOf` (new `allElements`, `innerOf`, `stripBetween`, `attrValue` helpers in `lib/html.js`). Regression tests parse 300 KB of hostile input per parser under a time budget.
- **Medium — storage quota exhaustion.** Scraped fields were persisted verbatim; one page with a multi-megabyte title could exceed the 10 MB quota and make every scan fail. Every item is now allow-listed and capped (`normalizeRawItem`) before scoring, and each source is capped at 500 items per scan.
- **Medium — private-host guard bypass over IPv6.** `[::ffff:127.0.0.1]`, `[::]`, NAT64 and 6to4 forms of loopback and RFC1918 addresses passed `isSafeHttpsUrl`. IPv6 literals are now expanded and classified; `.internal`, `.lan` and `.home.arpa` names are also blocked.
- Low: prototype-named ids and sort keys no longer resolve through inherited properties; the two credentialed UNGM requests refuse redirects; notification text is stripped of control characters, the organisation is capped, and notices from user-added sources are prefixed "(your source)"; unused `projects.worldbank.org` host permission removed; optional site permissions are revoked when their custom URLs are deleted; the smoke harness binds DevTools to loopback explicitly and deletes its temporary profile; privacy policy now describes UNGM cookie use and redirect handling accurately.

### Code quality (Opus 5.5 audit and refactor)
- Fixed: a dismissed or saved card could reappear when it was the last one visible, and hidden items could be selected by select-all; two near-simultaneous Scan requests both started a scan; several swallowed errors and unhandled rejections; keyword/source filters silently showing "All" while still applied; Enter on a focused button also opening the focused notice; settings accepted unvalidated at the service-worker boundary.
- Structure: popup split into focused modules (state, filters, scan UI, keyboard, banner, item actions, card view model) with `popup.js` at 134 lines; service worker split into `beginScan` / `collectRawItems` / `scoreAndPersist` / `finalizeScan` with network code in `background/network.js`; shared `ui/` modules for messaging, theme and formatting; `lib/settings.js` for validation and migration; `lib/pool.js`; connector helpers in `connectors/shared.js`; named constants throughout; no function over 50 lines.
- Tests: 76 → 136, including popup state, keyboard, settings validation, progress, card view model, manifest consistency, concurrency, stop, notification failure, size cap and alarm behaviour.

## 4.3.0 — 2026-10-07

### Redesign: "Swiss data-desk"
A different visual system, replacing the warm rounded cards of 4.1:
- Hairline-ruled rows instead of floating cards; no shadows; 2px corners; structure comes from rules, spacing and a strict type scale.
- Large monospace score numerals with a tier bar, monospace status line, deadlines and figures (tabular numerals throughout).
- Cobalt is the only interactive colour; orange is reserved for urgency (due within 3 days); green for positive actions and keyword matches.
- Underlined tabs for Active / New / Saved / Dismissed, underline-only selects, text actions instead of pill buttons.
- Settings page with a sticky numbered rail (01–05) and ruled, grouped source list.
- New cobalt toolbar icons.

### Re-audit fixes
- Closed notices (deadline passed) are now hidden by default; a *Show closed* filter reveals them, and saved notices always stay visible.
- Host-permission prompt for custom URLs is requested directly inside the click gesture (the previous `contains` pre-check could cancel the prompt).
- Status line shows source count, notice count and last scan time at a glance.
- Settings health badge pluralisation.

## 4.2.0 — 2026-10-05

### Sources
- **New** 9 Afghan ministry tender boards (Interior, Education, Energy & Water, Public Works, Mines & Petroleum, Communications & IT, Economy, Labour & Social Affairs, Hajj & Religious Affairs) through one shared parser for the government Drupal theme, with Solar Hijri (Jalali) dates and Persian digits converted to Gregorian.
- **New** UNAMA expressions of interest.
- **New** UNDP Afghanistan projects.
- Checked and documented as not scrapable: AGEOPS (login-only app), UNICEF and dgMarket (Cloudflare challenge), UNDP procurement and FAO (no notice list, both on UNGM), MoF and MoD (broken TLS).

### Settings
- Sources are grouped (International / Afghan government).

## 4.1.0 — 2026-10-05

### Sources (the big one)
An audit against the live sites found that only 2 of the 20 connectors returned real opportunities; the rest hit dead URLs, bot challenges, or scraped navigation links as if they were notices. The connector layer was rebuilt:

- **Fixed** ACBAR RFP/RFQ (site moved to `/en/`), with organisation and deadline now parsed from the new card layout.
- **New** ACBAR Jobs & consultancies.
- **New** UNGM (UN Global Marketplace) search for Afghanistan across all UN agencies, using the site's own search endpoint with its anti-forgery token, paged 15 at a time.
- **New** World Bank procurement notices via the official API (contract awards filtered out). World Bank projects no longer treat the project closing date as a bid deadline.
- **Fixed** Afghan Tenders (card layout, closing dates, locations).
- **Fixed** ACTED (correct listing URL, posted dates, country extraction; non-Afghan notices scored down).
- **New** ActionAid Afghanistan jobs and tenders with closing dates.
- **Changed** ReliefWeb now uses the official v2 API and needs a free appname (set in Settings) because ReliefWeb blocks anonymous scraping.
- **Removed** UNDP, UNJobs, UN Women, UNOPS, WFP, UNICEF, FAO, IOM, Tenders On Time, AKDN, CARE, ActionAid global: dead pages, bot walls, or JavaScript-only portals. The UN agencies are covered by UNGM. Saved settings migrate automatically.

### Performance
- Sources are fetched in parallel (bounded by *Parallel requests*) instead of one after another: a full scan now takes seconds instead of minutes.
- The service worker keeps itself alive during a scan and recovers cleanly if Chrome recycles it.
- Popup loads everything in one message; the opportunities map is cached in the worker; the list is reconciled in place instead of being rebuilt every two seconds (which used to wipe notes being typed).
- Response size cap, proper timeouts and network error messages.

### Popup redesign
- New "field notebook" visual system with real light and dark themes, shared design tokens, compact/comfortable density, reduced-motion support.
- Segmented Active / New / Saved / Dismissed inbox with counts, search with `/` shortcut, more filters (keyword, source) with reset.
- Cards: score ring, deadline urgency chips, posted age, cluster size, keyword chips, title opens the notice.
- Optimistic save/dismiss with **Undo** toasts; bulk bar with save, dismiss, export selection, clear.
- Keyboard navigation (`j`/`k`/`s`/`d`/`o`/`x`/`r`/`e`).
- Live scan panel with determinate progress, running sources, elapsed time, Stop.
- Contextual empty states (never scanned / no matches / inbox zero), offline banner, version from the manifest.

### Settings redesign
- Per-source health badges with item counts and timings, inline error text, and a **Test** button that fetches one source.
- ReliefWeb appname field, notifications toggle, inline validation for custom URLs, host permission request on save.
- Save bar with unsaved-changes state; "Scan now" from the settings page.

### Fixes
- Attribute injection in cards: the previous `escapeHtml` did not escape quotes, so a scraped title or note containing `"` could break out of an attribute. Cards are now built from a template with `textContent`.
- `hidden` elements were overridden by `display:flex` rules (onboarding, bulk bar, toast).
- Export of selected rows never sent the selection.
- Theme/density buttons replaced their SVG icons with text glyphs.
- Unhandled promise rejections from progress broadcasts when the popup was closed.
- Deadline parsing: unparseable dates no longer render as "Invalid Date" or get mis-read as US month-first.
- CSV cells starting with `=`, `+`, `-`, `@` are neutralised against formula injection.
- Scheduled alarm is re-created on browser start and when the interval changes.
- Item ids use a 53-bit hash instead of a 32-bit one.

### Tooling
- `npm test`: 65 unit tests with fixtures trimmed from the real pages.
- `npm run smoke`: headless Chrome for Testing harness that loads the extension, runs a live scan, exercises dismiss/undo and screenshots the popup and options pages.

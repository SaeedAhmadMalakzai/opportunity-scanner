# Changelog

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

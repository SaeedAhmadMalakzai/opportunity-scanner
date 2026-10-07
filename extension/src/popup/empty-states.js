/** Copy for the three empty result states (see pickEmptyState in state.js). */
export const EMPTY_STATES = Object.freeze({
  never: Object.freeze({
    title: "Nothing scanned yet",
    hint: "Pull the latest notices from ACBAR, UNGM, the World Bank, Afghan Tenders and more.",
    actionLabel: "Scan now", action: "scan"
  }),
  noMatches: Object.freeze({
    title: "No matches",
    hint: "Nothing fits these filters. Widen the search or lower the minimum score.",
    actionLabel: "Reset filters", action: "resetFilters"
  }),
  inboxZero: Object.freeze({
    title: "Inbox zero",
    hint: "Every notice has been triaged. Run a scan to look for new ones.",
    actionLabel: "Scan now", action: "scan"
  })
});

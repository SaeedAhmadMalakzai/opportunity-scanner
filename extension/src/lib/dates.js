const DAY_MS = 86400000;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function iso(y, m, d) {
  if (!(y >= 2000 && y <= 2100) || !(m >= 0 && m <= 11) || !(d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m, d));
  return dt.getUTCMonth() === m ? dt.toISOString() : null;
}

/**
 * Normalize many human date formats to an ISO string (UTC midnight for date-only values).
 * Returns null when the value cannot be interpreted as a plausible date.
 * Day-first is assumed for ambiguous numeric formats (dd/mm/yyyy) because every source is non-US.
 */
export function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/\s+/g, " ");
  if (raw.length < 6) return null;

  let m = raw.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);

  m = raw.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2}|\d{2})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2] - 1, +m[1]);
  }

  m = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]*([a-z]{3,9})[\s\-\/,]*(20\d{2})\b/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  }

  m = raw.match(/\b([a-z]{3,9})[\s\-]*(\d{1,2})(?:st|nd|rd|th)?[\s,]*(20\d{2})\b/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    if (dt.getUTCFullYear() >= 2000 && dt.getUTCFullYear() <= 2100) return dt.toISOString();
  }
  return null;
}

export function isExpired(deadlineIso, now = Date.now()) {
  if (!deadlineIso) return false;
  const t = Date.parse(String(deadlineIso));
  if (Number.isNaN(t)) return false;
  return t + DAY_MS <= now; // deadline day itself still counts as open
}

export function daysUntil(deadlineIso, now = Date.now()) {
  if (!deadlineIso) return null;
  const t = Date.parse(String(deadlineIso));
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / DAY_MS);
}

export function ageInDays(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return null;
  return (now - t) / DAY_MS;
}

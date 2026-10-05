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

/* ── Solar Hijri (Jalali) support for Afghan government sites ── */

const PERSIAN_DIGITS = /[۰-۹٠-٩]/g;

/** Replace Persian and Arabic-Indic digits with ASCII digits. */
export function asciiDigits(text) {
  return String(text ?? "").replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) % 16));
}

function div(a, b) { return Math.trunc(a / b); }

/** Jalali → Gregorian (algorithm by Kazimierz M. Borkowski, as used in jalaali-js). */
export function jalaliToGregorian(jy, jm, jd) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  for (let i = 1; i < breaks.length; i++) {
    const jm2 = breaks[i];
    const jump = jm2 - jp;
    if (jy < jm2) {
      let n = jy - jp;
      leapJ += div(n, 33) * 8 + div(n % 33 + 3, 4);
      if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
      break;
    }
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm2;
  }
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  const g2d = (y, m, d) => {
    let r = div((y + div(m - 8, 6) + 100100) * 1461, 4) + div(153 * ((m + 9) % 12) + 2, 5) + d - 34840408;
    r = r - div(div(y + 100100 + div(m - 8, 6), 100) * 3, 4) + 752;
    return r;
  };
  const jdn = g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  let j = 4 * jdn + 139361631 + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gyy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy: gyy, gm, gd };
}

/** Parse strings like "دوشنبه ۱۴۰۵/۷/۱۳ - ۱۱:۲۸" or "1405/7/13" into an ISO date; null when not Jalali. */
export function normalizeJalaliDate(value) {
  const ascii = asciiDigits(value);
  const m = ascii.match(/\b(1[34]\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (!m) return null;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return iso(gy, gm - 1, gd);
}

/** normalizeDate that also understands Jalali dates and Persian digits. */
export function normalizeAnyDate(value) {
  return normalizeJalaliDate(value) || normalizeDate(asciiDigits(value));
}

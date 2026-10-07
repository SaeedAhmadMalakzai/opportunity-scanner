function ipv4Parts(hostname) {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

const PRIVATE_NAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

/** Expand an IPv6 literal (without brackets) to eight 16-bit groups, or null when malformed. */
export function expandIpv6(bare) {
  const h = String(bare || "").toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(h) || h.split("::").length > 2) return null;
  const toGroups = (part) => (part ? part.split(":") : []).flatMap((g) => {
    if (g.includes(".")) { const v4 = ipv4Parts(g); return v4 ? [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]] : [NaN]; }
    return [g.length >= 1 && g.length <= 4 ? parseInt(g, 16) : NaN];
  });
  const [left, right] = h.split("::");
  const L = toGroups(left);
  const R = h.includes("::") ? toGroups(right) : [];
  const missing = 8 - L.length - R.length;
  if (missing < 0 || (!h.includes("::") && missing !== 0) || (h.includes("::") && missing < 1)) return null;
  const groups = [...L, ...Array(missing).fill(0), ...R];
  return groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff) ? null : groups;
}

function v4FromGroups(hi, lo) { return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`; }

/** Loopback, unspecified, link-local, unique-local, and IPv4-embedded forms (mapped, NAT64, 6to4) of private ranges. */
export function isPrivateIpv6(bare) {
  const p = expandIpv6(bare);
  if (!p) return true; // unparseable literal: treat as unsafe
  const leading = (n) => p.slice(0, n).every((g) => g === 0);
  if (leading(7) && p[7] <= 1) return true;                                       // :: and ::1
  if (leading(5) && p[5] === 0xffff) return isPrivateHostname(v4FromGroups(p[6], p[7])); // ::ffff:a.b.c.d
  if (p[0] === 0x64 && p[1] === 0xff9b && p.slice(2, 6).every((g) => g === 0)) return isPrivateHostname(v4FromGroups(p[6], p[7])); // NAT64 64:ff9b::/96
  if (p[0] === 0x2002) return isPrivateHostname(v4FromGroups(p[1], p[2]));         // 6to4
  if ((p[0] & 0xffc0) === 0xfe80 || (p[0] & 0xfe00) === 0xfc00 || p[0] === 0) return true; // link-local, ULA, ::/8
  return false;
}

export function isPrivateHostname(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "0.0.0.0" || PRIVATE_NAME_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true;
  if (h.startsWith("[") || h.includes(":")) return isPrivateIpv6(h.replace(/^\[|\]$/g, ""));
  const v4 = ipv4Parts(h);
  if (!v4) return false;
  const [a, b] = v4;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isSafeHttpsUrl(raw) {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    if (isPrivateHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Resolve a possibly-relative href against a base and return it only when it is a safe https URL. */
export function resolveHttpUrl(href, baseUrl) {
  try {
    const u = new URL(String(href).trim(), baseUrl);
    u.hash = "";
    return isSafeHttpsUrl(u.toString()) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function originPattern(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

const BULLET_PREFIX = /^[\s•‣⁃◦▪▫\-\*\t]+/;

/** Clean a user-entered list of URLs: strip bullets, drop unsafe entries, dedupe. */
export function sanitizeUrlList(lines) {
  const out = [];
  const seen = new Set();
  for (const raw of lines || []) {
    const cleaned = String(raw).replace(BULLET_PREFIX, "").trim();
    if (!isSafeHttpsUrl(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/** Return the entries of a user list that were rejected by sanitizeUrlList (for UI feedback). */
export function rejectedUrls(lines) {
  return (lines || [])
    .map((raw) => String(raw).replace(BULLET_PREFIX, "").trim())
    .filter((v) => v && !isSafeHttpsUrl(v));
}

/** Canonical form used for de-duplication: no hash, sorted query, no trailing slash noise. */
export function canonicalUrl(url) {
  try {
    const p = new URL(url);
    p.hash = "";
    p.searchParams.sort();
    p.hostname = p.hostname.toLowerCase();
    let s = p.toString();
    if (p.pathname !== "/" && s.endsWith("/") && !p.search) s = s.slice(0, -1);
    return s;
  } catch {
    return String(url || "");
  }
}

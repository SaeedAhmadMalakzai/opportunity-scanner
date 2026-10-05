function ipv4Parts(hostname) {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

export function isPrivateHostname(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "0.0.0.0") return true;
  if (h === "::1" || h === "[::1]") return true;
  if (h.includes(":")) {
    const bare = h.replace(/^\[|\]$/g, "");
    if (bare === "::1" || bare.startsWith("fe80:") || bare.startsWith("fc") || bare.startsWith("fd")) return true;
    const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateHostname(mapped[1]);
  }
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

// Site matching and search ranking. Pure functions; also loadable from node for tests.

const SLD = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "ne", "or"]);
// Subdomain labels too generic to say anything about which account you want.
const GENERIC = new Set(["www", "app", "apps", "login", "signin", "sign-in", "auth", "account", "accounts",
  "id", "sso", "my", "secure", "portal", "web", "m", "mobile", "admin", "dashboard", "console"]);
// Domains whose brand name differs from how people tend to name entries.
const ALIASES = { bsky: "bluesky", x: "twitter", live: "microsoft", microsoftonline: "microsoft",
  office: "microsoft", youtube: "google", gmail: "google", icloud: "apple", atlassian: "bitbucket" };

function siteInfo(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (!host || !host.includes(".")) return null;
  host = host.replace(/^www\d*\./, "");
  const parts = host.split(".");
  const n = parts.length >= 3 && parts.at(-1).length === 2 && SLD.has(parts.at(-2)) ? 3 : 2;
  const domain = parts.slice(-n).join(".");
  const base = parts.at(-n);
  const subs = parts.slice(0, -n).filter(l => !GENERIC.has(l) && l.length > 1);
  return { host, domain, base, subs, alias: ALIASES[base] };
}

// Score how well a pass entry path matches the current site (0 = no match).
function siteScore(entry, site) {
  const segs = entry.toLowerCase().split("/");
  const s = baseScore(segs, site.base, site);
  const sub = site.subs.some(l => segs.includes(l)) ? 10 : 0;
  const alias = site.alias ? baseScore(segs, site.alias, null) : 0;
  // A specific subdomain (aws in signin.aws.amazon.com) outranks the brand when it's the entry's folder.
  if (!s && !alias) return sub ? (site.subs.includes(segs[0]) ? 78 : 65) : 0;
  // Prefer entries filed under the brand (apple/x) over ones that merely mention it (floatr/apple).
  const top = segs[0] === site.base || segs[0] === site.alias ? 5 : 0;
  return Math.max(s, alias) + sub + top;
}

function baseScore(segs, base, site) {
  const e = segs.join("/");
  if (site) {
    if (segs.includes(site.host)) return 100;
    if (segs.includes(site.domain)) return 95;
    if (segs.some(s => s.endsWith("." + site.domain))) return 90;
    if (e.includes(site.domain)) return 80;
  }
  if (segs.includes(base)) return 70;
  if (base.length >= 4 && segs.some(s => s.split(/[^a-z0-9]+/).includes(base))) return 60;
  if (base.length >= 5 && e.includes(base)) return 40;
  return 0;
}

function siteMatches(entries, site) {
  if (!site) return [];
  return entries
    .map(e => [e, siteScore(e, site)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .map(([e]) => e);
}

// Every whitespace-separated term must appear; rank by how early/tightly they match.
function search(entries, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  const out = [];
  for (const e of entries) {
    const l = e.toLowerCase();
    const name = l.slice(l.lastIndexOf("/") + 1);
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const i = l.indexOf(t);
      if (i < 0) { ok = false; break; }
      score += i;
      if (name.startsWith(t)) score -= 50;
      else if (i === 0 || l[i - 1] === "/" || l[i - 1] === "." || l[i - 1] === "-") score -= 20;
    }
    if (ok) out.push([e, score + l.length / 100]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(([e]) => e);
}

if (typeof module !== "undefined") module.exports = { siteInfo, siteScore, siteMatches, search };

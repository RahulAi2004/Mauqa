// robots.txt enforcement for outbound link fetching.
//
// Mauqa fetches a URL only because a user handed it one, but that is still an
// automated request, and some sites say plainly that they do not want them.
// Instagram's robots.txt ends with:
//
//   User-agent: *
//   Disallow: /
//
// on top of a notice that automated collection needs written permission. So the
// correct behaviour is not to send a cleverer request — it is not to send one.
// The user's own screenshot or pasted caption stays available and needs nobody's
// permission, because that content is already theirs.

const CACHE_TTL_MS = 60 * 60 * 1000; // robots.txt rarely moves; an hour is plenty
const cache = new Map(); // origin -> { rules, expires }

// Our token as it would appear in a robots.txt group heading.
export const BOT_TOKEN = 'mauqabot';

function parse(txt, token) {
  const lines = String(txt).split(/\r?\n/);
  const groups = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group of rules.
      if (!current || current.hasRules) { current = { agents: [], rules: [], hasRules: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((field === 'disallow' || field === 'allow') && current) {
      current.hasRules = true;
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  // A group naming us wins over the wildcard group; if neither exists, nothing
  // applies and everything is permitted.
  const mine = groups.find((g) => g.agents.includes(token));
  const star = groups.find((g) => g.agents.includes('*'));
  return (mine || star)?.rules || [];
}

function matches(rule, path) {
  if (rule.path === '') return false; // "Disallow:" with no value means allow all
  // Only the two wildcards robots.txt defines: * for any run, $ for end-of-path.
  const pattern = rule.path
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  try { return new RegExp(`^${pattern}`).test(path); } catch { return false; }
}

async function rulesFor(origin) {
  const hit = cache.get(origin);
  if (hit && hit.expires > Date.now()) return hit.rules;

  let rules = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': BOT_TOKEN },
      signal: AbortSignal.timeout(5000),
    });
    // 404 or 5xx: no usable policy, so nothing is forbidden.
    if (res.ok) rules = parse(await res.text(), BOT_TOKEN);
  } catch {
    // Unreachable robots.txt must not become a silent block — fetching is the
    // user's explicit request, and we only step aside on an explicit refusal.
  }

  cache.set(origin, { rules, expires: Date.now() + CACHE_TTL_MS });
  return rules;
}

/**
 * @returns {Promise<{ allowed: boolean, rule: string|null }>}
 *   allowed:false only when robots.txt explicitly disallows this path for us.
 */
export async function isAllowed(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return { allowed: false, rule: null }; }

  const rules = await rulesFor(parsed.origin);
  if (!rules.length) return { allowed: true, rule: null };

  const path = parsed.pathname + parsed.search;
  // Longest matching rule wins; Allow beats Disallow at equal length.
  let best = null;
  for (const r of rules) {
    if (!matches(r, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  if (!best || best.allow) return { allowed: true, rule: null };
  return { allowed: false, rule: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` };
}

// Fetch a shared URL and pull out whatever public metadata we can get.
// Social platforms (Instagram/TikTok) often gate content behind login — we treat
// whatever we get as helpful context, never the only source of truth.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Social platforms hand a browser User-Agent a JavaScript shell with nothing in
// it, but still fill in Open Graph tags for link-preview crawlers. So when the
// normal fetch comes back empty we ask a second time as a crawler. It is a
// fallback rather than the default because plenty of ordinary sites serve
// crawlers a thinner page than they serve a browser.
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

export function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('youtube') || host === 'youtu.be') return 'youtube';
    if (host.includes('linkedin')) return 'linkedin';
    if (host.includes('facebook') || host === 'fb.watch') return 'facebook';
    if (host.includes('twitter') || host === 'x.com') return 'x';
    return host;
  } catch {
    return 'web';
  }
}

// SSRF guard: never fetch loopback/private/link-local hosts.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (['localhost', '0.0.0.0', '::1', '[::1]'].includes(h) || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return true;
  }
  return false;
}

// A page can return HTTP 200 and still contain nothing to extract from.
// Instagram is the clearest case: a reel URL answers with a login wall whose
// entire visible text is the word "Instagram" — 9 characters. Reporting that as
// a successful fetch makes the UI claim it reached the source when it learned
// nothing, so callers need to tell the two apart.
function hasUsableText({ title, description, pageText }) {
  const text = [description, pageText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  // Strip the title so a page echoing only its own name doesn't count as content.
  const beyondTitle = title ? text.split(title).join(' ').replace(/\s+/g, ' ').trim() : text;
  return beyondTitle.length >= 40;
}

export async function fetchMeta(url) {
  const result = { url, platform: detectPlatform(url), title: null, description: null, image: null, pageText: null, fetched: false, usable: false };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) return result;
  } catch {
    return result;
  }
  const readWith = async (ua) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('html')) return null;
    const html = (await res.text()).slice(0, 800_000);
    return {
      title: metaContent(html, 'og:title') || metaContent(html, 'twitter:title')
        || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null),
      description: metaContent(html, 'og:description') || metaContent(html, 'twitter:description')
        || metaContent(html, 'description'),
      image: metaContent(html, 'og:image'),
      pageText: visibleText(html),
    };
  };

  const apply = (read) => {
    Object.assign(result, read);
    result.fetched = true;
    result.usable = hasUsableText(result);
  };

  try {
    const first = await readWith(UA);
    if (!first) return result;
    apply(first);
  } catch {
    // Blocked, timed out, or offline — extraction continues with whatever else we have.
    return result;
  }

  // Second pass only when the first learned nothing. Worst case it also comes
  // back empty and we keep what we already had.
  if (!result.usable) {
    try {
      const second = await readWith(CRAWLER_UA);
      if (second) {
        const merged = { ...result, ...second };
        if (hasUsableText(merged)) apply(second);
      }
    } catch { /* the browser-UA result stands */ }
  }

  return result;
}

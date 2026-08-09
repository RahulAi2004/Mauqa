// Derived opportunity state. Everything here is computed from columns that
// ALREADY exist (apply_link, source_url, deadline, event_date, confidence,
// needs_review, requirements, requirements_done, eligibility, extraction_mode,
// status) — no schema change, no new API.
//
// Four derivations drive the whole experience:
//   trust()        — how much can I believe this record?
//   documents()    — am I prepared to apply?
//   nextAction()   — what is the single next thing to do?
//   risk()         — how close is it AND how unprepared am I?

import { daysLeft } from './api.js';

const CATEGORY_META = {
  scholarship: { label: 'Scholarship', emoji: '🎓' },
  internship: { label: 'Internship', emoji: '💼' },
  job: { label: 'Job', emoji: '🏢' },
  hackathon: { label: 'Hackathon', emoji: '💻' },
  fellowship: { label: 'Fellowship', emoji: '🏅' },
  competition: { label: 'Competition', emoji: '🏆' },
  grant: { label: 'Grant', emoji: '💰' },
  workshop: { label: 'Workshop', emoji: '🛠' },
  admission: { label: 'Admission', emoji: '🏫' },
  certification: { label: 'Certification', emoji: '📜' },
  course: { label: 'Course', emoji: '📘' },
  other: { label: 'Opportunity', emoji: '🎯' },
};

export const categoryMeta = (c) => CATEGORY_META[c] || CATEGORY_META.other;

// Single source of truth for the category dropdown / filters.
export const CATEGORIES = Object.keys(CATEGORY_META);

export const isOpportunity = (o) => o.item_type === 'opportunity';

// ---------- eligibility ----------
// Its own column since the eligibility migration. Read-only criteria: they say
// whether you MAY apply, so there is no "done" state to track.
export function eligibility(o) {
  const list = (o.eligibility || []).map((text, i) => ({ i, text }));
  return { total: list.length, list };
}

// ---------- required documents / actions ----------
export function documents(o) {
  const list = (o.requirements || []).map((text, i) => ({ i, text }));
  const doneIdx = new Set(o.requirements_done || []);
  const done = list.filter((r) => doneIdx.has(r.i)).length;
  // Guard the text too: a blank requirement would otherwise surface as "Prepare null".
  const next = list.find((r) => !doneIdx.has(r.i) && r.text?.trim())?.text || null;
  return { total: list.length, done, next, complete: list.length === 0 || done >= list.length, list, doneIdx };
}

// ---------- capture auto-detection ----------
const URL_RE = /https?:\/\/[^\s<>"')]+/i;

export function detectPayload(text, image) {
  const t = (text || '').trim();
  const url = t.match(URL_RE)?.[0]?.replace(/[),.]+$/, '') || null;
  const rest = url ? t.replace(url, ' ').trim() : t;
  const payload = {};
  if (url) payload.url = url;
  if (rest) payload.text = rest;
  if (image?.data) payload.image = { data: image.data, media_type: image.media_type };
  const kinds = [url && 'link', image?.data && 'screenshot', rest && 'text'].filter(Boolean);
  return { payload, url, kinds };
}

// ---------- source honesty ----------
// Mauqa never opens the apply link and never checks whether a domain is the
// "official" one. These helpers report exactly what did happen and nothing more.
const SOCIAL_HOSTS = /(instagram|tiktok|facebook|fb\.watch|twitter|x\.com|youtube|youtu\.be|t\.me|snapchat|threads|pinterest|reddit)/i;

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; }
}

export function sourceState({ sentUrl, fetched, usable, robotsBlocked }) {
  if (!sentUrl) return { level: 'missing', label: 'No source link — captured from text or a screenshot' };
  const host = hostOf(sentUrl);
  // Not a failure — a choice. The site's robots.txt refuses automated requests,
  // so Mauqa never sent one.
  if (robotsBlocked) {
    return { level: 'blocked', host, label: `${host} does not allow apps to read its posts — Mauqa did not fetch it` };
  }
  // Loaded but empty is its own state: claiming the source was "reached" when the
  // page handed back a login wall is the one thing this panel must never do.
  if (fetched && !usable) {
    return { level: 'empty', host, label: `${host} opened, but the post itself is hidden behind a login` };
  }
  if (fetched) return { level: 'loaded', host, label: `Page loaded from ${host}` };
  return { level: 'unreachable', host, label: `Could not open ${host} — it may require a login` };
}

// True when the link could not tell us anything — whether because the site
// refuses automated requests or because the page came back empty. Either way the
// user should be pointed at the caption or a screenshot rather than retrying.
export function sourceIsBlind({ sentUrl, fetched, usable, robotsBlocked } = {}) {
  return !!sentUrl && (!!robotsBlocked || (!!fetched && !usable));
}

export function applyLinkState(applyLink, { sentUrl, fetched } = {}) {
  if (!applyLink) return { level: 'missing', label: 'Application link not confirmed' };
  const host = hostOf(applyLink);
  if (!host) return { level: 'missing', label: 'Application link not confirmed' };
  if (SOCIAL_HOSTS.test(host)) return { level: 'weak', host, label: `Points to ${host} — a social post, not an application page` };
  if (fetched && hostOf(sentUrl) === host) return { level: 'loaded', host, label: `Page loaded from ${host} — Mauqa has not checked it is official` };
  return { level: 'unconfirmed', host, label: `Found on ${host} — Mauqa has not opened this link` };
}

// ---------- TRUST ----------
// An honest four-state read of how much evidence backs this record. Social
// media is discovery, never verification. Mauqa never claims a source is
// "official" — only that a non-social origin exists and the critical fields
// came through cleanly.
export const TRUST_META = {
  verified: { label: 'Verified', short: 'Verified', icon: '✓', tone: 'good' },
  partial: { label: 'Partially verified', short: 'Partial', icon: '◐', tone: 'info' },
  needs_review: { label: 'Needs review', short: 'Review', icon: '!', tone: 'warn' },
  unverified: { label: 'Unverified', short: 'Unverified', icon: '○', tone: 'muted' },
};

const CRITICAL = ['deadline', 'apply_link', 'source'];

export function trust(o) {
  const nr = new Set(o.needs_review || []);
  const conf = o.confidence || {};
  const linkHost = hostOf(o.apply_link);
  const srcHost = hostOf(o.source_url);

  // "Authoritative" here means only: a real, non-social web origin exists.
  const nonSocial = [linkHost, srcHost].filter(Boolean).filter((h) => !SOCIAL_HOSTS.test(h));
  const hasNonSocialSource = nonSocial.length > 0;
  const originHost = nonSocial[0] || linkHost || srcHost || null;

  const criticalFlagged = CRITICAL.some((f) => nr.has(f)) || conf.deadline === 'low' || conf.apply_link === 'low';
  const reasons = [];

  // 1. Nothing but a social post, a screenshot or pasted text backs this.
  if (!hasNonSocialSource) {
    if (o.extraction_mode === 'mock') reasons.push('extracted without AI');
    if (!linkHost && !srcHost) reasons.push('no web source captured');
    else reasons.push(`only a social/unknown source (${srcHost || linkHost})`);
    return { ...TRUST_META.unverified, level: 'unverified', host: originHost, reasons };
  }

  // 2. A critical field still needs a human.
  if (criticalFlagged || !o.deadline || !o.apply_link) {
    if (!o.deadline) reasons.push('no deadline confirmed');
    if (!o.apply_link) reasons.push('no application link');
    for (const f of CRITICAL) if (nr.has(f)) reasons.push(`${f.replace('_', ' ')} flagged by the extractor`);
    if (conf.deadline === 'low') reasons.push('low confidence on the deadline');
    return { ...TRUST_META.needs_review, level: 'needs_review', host: originHost, reasons };
  }

  // 3. Everything critical present, high confidence, nothing outstanding.
  if (conf.deadline === 'high' && conf.apply_link === 'high' && nr.size === 0) {
    reasons.push(`structured from ${originHost}`);
    return { ...TRUST_META.verified, level: 'verified', host: originHost, reasons };
  }

  // 4. Structured and usable, with some non-critical softness left.
  if (nr.size) reasons.push(`${[...nr].join(', ')} unconfirmed`);
  else reasons.push('some fields are medium confidence');
  return { ...TRUST_META.partial, level: 'partial', host: originHost, reasons };
}

// ---------- deadline copy ----------
export function deadlineCopy(o) {
  if (!o.deadline) return { text: 'Deadline not confirmed', tone: 'none', days: null };
  const d = daysLeft(o.deadline);
  if (d < 0) return { text: 'Deadline passed', tone: 'urgent', days: d };
  if (d === 0) return { text: 'Due today', tone: 'urgent', days: 0 };
  if (d === 1) return { text: 'Due tomorrow', tone: 'urgent', days: 1 };
  if (d <= 7) return { text: `${d} days left`, tone: 'soon', days: d };
  return { text: `${d} days left`, tone: 'ok', days: d };
}

// ---------- readiness ----------
export function readiness(o) {
  const d = documents(o);
  const r = d.total ? d.done / d.total : 1;
  return o.apply_link ? r : Math.min(r, 0.5);
}

// ---------- risk = deadline proximity × unreadiness ----------
export function risk(o) {
  const dl = daysLeft(o.deadline);
  if (dl === null) return 0;
  const urgency = 1 / (1 + Math.max(dl, 0) / 7);
  return urgency * (1 + (1 - readiness(o)));
}

// ---------- NEXT ACTION ----------
// One derived instruction, shared by OpportunityCard, Detail and Today.
// Never creates a database task.
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export function nextAction(o) {
  const t = trust(o);
  const d = documents(o);
  const dl = daysLeft(o.deadline);

  if (o.status === 'done') return { text: 'Applied — nothing left to do', cta: 'View', kind: 'open' };
  if (o.status === 'missed' || (dl !== null && dl < 0)) {
    return { text: 'Deadline passed — review or reschedule', cta: 'Review', kind: 'open' };
  }
  if (t.level === 'needs_review' || t.level === 'unverified') {
    if (!o.apply_link && o.deadline) return { text: 'Confirm the application link', cta: 'Review', kind: 'edit' };
    return { text: 'Review opportunity details', cta: 'Review', kind: 'open' };
  }
  if (!o.apply_link) return { text: 'Confirm the application link', cta: 'Review', kind: 'edit' };
  if (!d.complete && d.next) return { text: `Prepare ${lowerFirst(d.next)}`, cta: 'Continue', kind: 'open' };
  if (d.total > 0) return { text: 'Review and apply', cta: 'Apply', kind: 'apply' };
  return { text: 'Review and apply', cta: 'Apply', kind: 'apply' };
}

// ---------- stages ----------
export const STAGES = [
  { key: 'all', label: 'All' },
  { key: 'verifying', label: 'Needs check' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready to apply' },
  { key: 'applied', label: 'Applied' },
  { key: 'missed', label: 'Missed' },
];

export function stage(o) {
  const dl = daysLeft(o.deadline);
  if (o.status === 'done') return 'applied';
  if (o.status === 'missed' || (dl !== null && dl < 0)) return 'missed';
  const level = trust(o).level;
  if (level === 'needs_review' || level === 'unverified') return 'verifying';
  return documents(o).complete ? 'ready' : 'preparing';
}

// ---------- Today ----------
export const CLOSING_WINDOW_DAYS = 30;

export function closingSoon(items, limit = 3) {
  return items
    .filter((o) => isOpportunity(o) && o.status === 'pending' && o.deadline)
    .filter((o) => {
      const dl = daysLeft(o.deadline);
      return dl !== null && dl >= 0 && dl <= CLOSING_WINDOW_DAYS;
    })
    .sort((a, b) => risk(b) - risk(a))
    .slice(0, limit);
}

/**
 * "Needs your attention" — at most `limit` opportunities that genuinely require
 * a move today. Ranked: due today → approaching deadline → incomplete documents
 * → needs review. Deliberately excludes anything that is simply sitting fine.
 */
export function attention(items, limit = 3) {
  return items
    .filter((o) => isOpportunity(o) && o.status === 'pending')
    .map((o) => {
      const dl = daysLeft(o.deadline);
      const d = documents(o);
      const level = trust(o).level;
      const overdue = dl !== null && dl < 0;
      let priority = 0;
      if (overdue) priority = 0;                                   // gone — do not nag
      else if (dl === 0) priority = 100;                           // due today
      else if (dl !== null && dl <= 7) priority = 90 - dl;         // approaching
      else if (!d.complete && dl !== null && dl <= 21) priority = 60 - Math.min(dl, 20);
      else if (!d.complete) priority = 40;                         // incomplete documents
      else if (level === 'needs_review' || level === 'unverified') priority = 30;
      return { o, priority };
    })
    .filter((x) => x.priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((x) => x.o);
}

// Shared sort for opportunity lists. Closed items sink to the bottom.
export function byRisk(a, b) {
  const closed = (o) => (['applied', 'missed'].includes(stage(o)) ? 1 : 0);
  const ca = closed(a);
  const cb = closed(b);
  if (ca !== cb) return ca - cb;
  if (ca === 1) return (b.deadline || '').localeCompare(a.deadline || '');
  const r = risk(b) - risk(a);
  if (r !== 0) return r;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
}

// AI extraction engine: evidence (link metadata + page text + screenshot + pasted text)
// goes in, a structured opportunity draft with per-field confidence comes out.
// If no provider credentials are available, a regex-based mock extractor keeps the
// app fully usable — every mock draft is flagged so the user knows to verify fields.
//
// The provider lives behind ./ai/openrouter.js. This file owns the schemas, the
// prompt rules and the fallback; it never sees an API key or a model name.

import * as provider from './ai/openrouter.js';
import { normalizeDeadlineTime } from './time.js';

const CATEGORIES = ['internship', 'scholarship', 'job', 'hackathon', 'fellowship', 'competition',
  'grant', 'workshop', 'admission', 'certification', 'course', 'other'];
const CONF = ['high', 'medium', 'low'];

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

// deadline_time is the one field with a hard machine contract: it is fed
// straight into `new Date(...)`. Constrain it at the schema level; server-side
// normalisation in time.js is the second layer for models that ignore `pattern`.
const HHMM_PATTERN = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
const nullableTime = { anyOf: [{ type: 'string', pattern: HHMM_PATTERN }, { type: 'null' }] };

const DATE_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
const nullableDate = { anyOf: [{ type: 'string', pattern: DATE_PATTERN }, { type: 'null' }] };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'organization', 'category', 'deadline', 'deadline_time', 'event_date', 'apply_link',
    'location', 'compensation', 'eligibility', 'requirements', 'summary', 'tags', 'confidence', 'needs_review'],
  properties: {
    title: { type: 'string', description: 'Short name of the opportunity' },
    organization: nullableString,
    category: { type: 'string', enum: CATEGORIES },
    deadline: { ...nullableDate, description: 'Application deadline as YYYY-MM-DD, or null if not stated' },
    deadline_time: { ...nullableTime, description: 'Deadline time in 24-hour HH:MM form only, e.g. "23:59". Never include AM/PM or a timezone. Use null if no time is stated.' },
    event_date: {
      ...nullableDate,
      description: 'YYYY-MM-DD date the opportunity itself HAPPENS or BEGINS — event day, programme/course start, hackathon date, batch start. This is NOT the application deadline. For a range ("20–21 August"), use the START date. Null if no such date is stated.',
    },
    apply_link: { ...nullableString, description: 'Direct application URL if stated; null if only "link in bio" etc.' },
    location: nullableString,
    compensation: { ...nullableString, description: 'Stipend, salary, prize, scholarship amount, or fee if mentioned' },
    eligibility: {
      type: 'array',
      items: { type: 'string' },
      description: 'Criteria that decide WHO may apply — age limits, CGPA/grades, nationality, residency, year of study, field of study, experience. NOT things to submit.',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Documents or actions the applicant must PRODUCE — CV, transcript, reference letters, essays, portfolio, test scores, forms. NOT eligibility criteria.',
    },
    summary: { type: 'string', description: '1-2 sentence plain summary' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Short lowercase tags, e.g. cs, remote, abroad, students' },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'organization', 'deadline', 'apply_link'],
      properties: {
        title: { type: 'string', enum: CONF },
        organization: { type: 'string', enum: CONF },
        deadline: { type: 'string', enum: CONF },
        apply_link: { type: 'string', enum: CONF },
      },
    },
    needs_review: { type: 'array', items: { type: 'string' }, description: 'Field names the user must verify (uncertain or missing-but-important)' },
  },
};

let aiDisabled = false;
let modeCache = null; // 'live' | 'mock' — resolved once by a real credential check
let modeReason = null;

// Credentials are only truly proven at request time, so check once and cache.
export async function aiMode() {
  if (modeCache) return modeCache;
  if (aiDisabled || !provider.isConfigured()) {
    modeReason = 'no_api_key';
    return (modeCache = 'mock');
  }
  const { ok, reason } = await provider.verify();
  modeReason = reason;
  if (!ok) {
    aiDisabled = true;
    return (modeCache = 'mock');
  }
  return (modeCache = 'live');
}

// Safe to serialise to the client: provider name and model only, never the key.
export function aiInfo() {
  return { ...provider.info(), reason: modeReason, fallback: 'local regex extractor' };
}

// A hard auth rejection mid-flight downgrades the process to mock so we stop
// hammering the provider; anything else is treated as a one-off failure.
function noteFailure(e) {
  if (e?.authFailed) {
    aiDisabled = true;
    modeCache = 'mock';
    modeReason = 'invalid_api_key';
  } else if (e?.modelUnavailable) {
    // Permanent for this model — stop claiming live and stop burning requests.
    // Transient failures (timeouts, 5xx, 429) deliberately fall through here.
    aiDisabled = true;
    modeCache = 'mock';
    modeReason = 'model_unavailable';
  }
}

function buildPrompt({ meta, text, hasImage }) {
  const today = new Date().toISOString().slice(0, 10);
  let evidence = '';
  if (meta?.url) evidence += `SHARED URL (${meta.platform}): ${meta.url}\n`;
  if (meta?.title) evidence += `PAGE TITLE: ${meta.title}\n`;
  if (meta?.description) evidence += `PAGE DESCRIPTION: ${meta.description}\n`;
  if (meta?.pageText) evidence += `PAGE TEXT (may be noisy):\n${meta.pageText}\n`;
  if (text) evidence += `USER-PASTED TEXT / CAPTION:\n${text}\n`;
  if (hasImage) evidence += `A SCREENSHOT is attached — read all visible text in it (poster text, captions, on-screen text).\n`;

  return `You are the extraction engine of an "opportunity inbox" app used by students in Pakistan.
The user saved a social media post about an opportunity (internship, scholarship, hackathon, job, etc.).
Extract ONE structured opportunity record from the evidence below.

Rules:
- Today's date is ${today} (Asia/Karachi). Resolve relative or year-less dates against it: a month/day with no year means the NEXT occurrence on or after today.
- NEVER invent data. If a field is not clearly present, use null (or empty array) and give it low confidence.
- If the post says "link in bio" or gives no direct URL, apply_link is null and must be listed in needs_review.
- deadline and event_date are DIFFERENT fields and must never be swapped. deadline = the last moment to apply/register/submit. event_date = when the thing actually happens or begins. "Applications close September 10. Programme begins October 5." → deadline 2026-09-10, event_date 2026-10-05. If only one date exists, decide which it is from the wording and leave the other null. For a date range, event_date is the START date.
- Choose the category by what the user receives: a credential you earn is "certification"; taught classes or a cohort you study in is "course"; a short one-off training session is "workshop"; funding for study is "scholarship".
- Keep eligibility and requirements strictly separate. "CGPA 3.0 or above", "must be under 25", "open to Pakistani nationals", "final year students only" are ELIGIBILITY. "attested transcript", "updated CV", "two reference letters", "IELTS score report" are REQUIREMENTS. If a line states a criterion AND a document, put the document in requirements. Use empty arrays rather than guessing.
- List in needs_review every field that is missing or that you are not confident about — deadline and apply_link especially. Being honest beats looking complete.

EVIDENCE:
${evidence || '(no evidence provided)'}`;
}

export async function extractWithAI({ meta, text, image }) {
  if ((await aiMode()) !== 'live') return null;
  try {
    const draft = await provider.complete({
      prompt: buildPrompt({ meta, text, hasImage: !!image?.data }),
      image,
      schema: SCHEMA,
      schemaName: 'opportunity',
      // Reasoning models spend most of this budget on hidden reasoning tokens
      // (measured: 750-900 on gemini-3.5-flash) before a single field of JSON is
      // emitted. At 2048 the answer was truncated often enough to drop ~1 in 10
      // extractions to the regex fallback with "did not return valid JSON".
      maxTokens: 6000,
    });
    // Second safety layer: the schema pattern is advisory for some models.
    normalizeDeadlineTime(draft);
    return { ...draft, extraction_mode: 'ai' };
  } catch (e) {
    noteFailure(e);
    throw e; // the route reports aiError and falls back to extractMock
  }
}

// ---------- Quick-add natural language parsing (AI path) ----------

const ITEM_TYPES = ['meeting', 'test', 'assignment', 'bill', 'task', 'event', 'opportunity', 'other'];

const QUICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'item_type', 'deadline', 'deadline_time', 'recurrence'],
  properties: {
    title: { type: 'string', description: 'Clean title with date/time words removed' },
    item_type: { type: 'string', enum: ITEM_TYPES },
    deadline: { ...nullableString, description: 'YYYY-MM-DD or null' },
    deadline_time: { ...nullableTime, description: '24-hour HH:MM only, e.g. "15:00". Never AM/PM. Null if no time.' },
    recurrence: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'] },
  },
};

export async function quickParseAI(text) {
  if ((await aiMode()) !== 'live') return null;
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  try {
    const parsed = await provider.complete({
      prompt: `Parse this quick-add reminder line into a structured item. Today is ${weekday}, ${now.toISOString().slice(0, 10)} (Asia/Karachi).
The user may mix English, Urdu, or Roman Urdu: "kal" = tomorrow, "parso" = day after tomorrow, "aaj" = today, "har roz" = daily, "har hafta" = weekly, "har mahinay" = monthly.
Day names mean the NEXT occurrence of that day. An "interview" or "call" is a meeting; "exam"/"quiz" is a test; "submit"/"due" suggests assignment. Never invent a date that isn't implied.

LINE: ${text}`,
      schema: QUICK_SCHEMA,
      schemaName: 'quick_add',
      // 400 was below the model's reasoning-token floor, so every quick parse
      // finished with reason "length" and an empty body — see extractWithAI.
      maxTokens: 2000,
    });
    return normalizeDeadlineTime(parsed);
  } catch (e) {
    noteFailure(e);
    return null; // the route answers 503 and the client uses its local parser
  }
}

// ---------- Mock extractor (no API key needed) ----------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function findDate(text) {
  if (!text) return null;
  const now = new Date();
  // 1) ISO / numeric: 2026-08-05, 05/08/2026, 5-8-2026
  let m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  // 2) "5 August 2026" / "Aug 5, 2026" / "August 5" (year optional)
  const monthNames = Object.keys(MONTHS).join('|');
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\.?,?\\s*(20\\d{2})?`, 'i'))
    || text.match(new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(20\\d{2})?`, 'i'));
  if (m) {
    let day, monKey, year;
    if (/^\d/.test(m[1])) { day = Number(m[1]); monKey = m[2].slice(0, 3).toLowerCase(); year = m[3]; }
    else { monKey = m[1].slice(0, 3).toLowerCase(); day = Number(m[2]); year = m[3]; }
    const mon = MONTHS[monKey];
    if (mon && day >= 1 && day <= 31) {
      let y = year ? Number(year) : now.getFullYear();
      const candidate = new Date(y, mon - 1, day);
      if (!year && candidate < now) y += 1;
      return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function guessCategory(text) {
  const t = (text || '').toLowerCase();
  for (const [cat, words] of [
    ['scholarship', ['scholarship', 'fully funded', 'funded degree', 'stipendium']],
    ['internship', ['internship', 'intern ']],
    ['hackathon', ['hackathon', 'hackfest', 'datathon']],
    ['fellowship', ['fellowship', 'fellow ']],
    ['competition', ['competition', 'contest', 'olympiad', 'challenge']],
    ['grant', ['grant', 'funding for']],
    ['workshop', ['workshop', 'bootcamp', 'training program']],
    ['admission', ['admission', 'apply now for fall', 'entry test']],
    ['job', ['hiring', 'job opening', 'vacancy', 'we are looking for', 'position']],
  ]) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return 'other';
}

export function extractMock({ meta, text }) {
  const combined = [meta?.title, meta?.description, text, meta?.pageText].filter(Boolean).join('\n');
  const firstLine = (text || meta?.title || meta?.description || 'Saved opportunity')
    .split('\n').map((l) => l.trim()).find((l) => l.length > 3) || 'Saved opportunity';
  const deadline = findDate(combined);
  const linkMatch = (text || '').match(/https?:\/\/\S+/) || (meta?.description || '').match(/https?:\/\/\S+/);
  const category = guessCategory(combined);

  return {
    title: firstLine.slice(0, 120),
    organization: null,
    category,
    deadline,
    deadline_time: null,
    event_date: null, // the regex fallback never guesses which date is which
    apply_link: linkMatch ? linkMatch[0].replace(/[),.]+$/, '') : null,
    location: null,
    compensation: null,
    eligibility: [],
    requirements: [],
    summary: (meta?.description || text || '').slice(0, 200) || 'Add details manually — AI extraction is off (no API key).',
    tags: [category !== 'other' ? category : null].filter(Boolean),
    confidence: {
      title: 'medium',
      organization: 'low',
      deadline: deadline ? 'medium' : 'low',
      apply_link: linkMatch ? 'medium' : 'low',
    },
    needs_review: ['title', 'deadline', 'apply_link', 'organization'],
    extraction_mode: 'mock',
  };
}

// Canonical time handling. deadline_time is stored ONLY as "HH:mm" (24h) or null.
//
// This exists because a model asked for "HH:MM 24h" can still answer
// "11:59 PM PKT", and that value flows straight into
//   new Date(`${deadline}T${deadline_time}:00`)
// producing an Invalid Date — which silently yields zero reminders. Normalising
// at every write boundary means the database can only ever hold a usable value.

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidTime = (v) => typeof v === 'string' && HHMM.test(v);

// Calendar dates (deadline, event_date) are stored only as YYYY-MM-DD.
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDate = (v) => {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && v === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Anything not a real YYYY-MM-DD becomes null rather than poisoning date maths. */
export function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return { date: null, ok: true };
  if (isValidDate(value)) return { date: value, ok: true };
  return { date: null, ok: false };
}

const pad = (n) => String(n).padStart(2, '0');

// Trailing timezone abbreviations / offsets the model tends to append.
const TZ = /\b(pkt|pst|pdt|gmt|utc|est|edt|cst|cdt|mst|ist|cet|cest|bst|aest|jst|z)\b|\s[+-]\d{1,2}(:?\d{2})?$/gi;

/**
 * @returns {{ time: string|null, ok: boolean, changed: boolean }}
 *   ok:false means the input was present but could not be safely understood —
 *   callers must null the field and flag it for review rather than guess.
 */
export function normalizeTime(value) {
  if (value === null || value === undefined) return { time: null, ok: true, changed: false };
  if (typeof value !== 'string') return { time: null, ok: false, changed: true };

  const original = value.trim();
  if (!original) return { time: null, ok: true, changed: false };
  if (HHMM.test(original)) return { time: original, ok: true, changed: false };

  // "11:59 P.M. PKT" → "11:59 pm"
  let s = original.toLowerCase()
    .replace(/ /g, ' ')
    .replace(/([ap])\.\s*m\.?/g, '$1m')
    .replace(TZ, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 12-hour: "7 pm", "7:30pm", "11:59 pm"
  let m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return { time: null, ok: false, changed: true };
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return { time: `${pad(h)}:${pad(min)}`, ok: true, changed: true };
  }

  // 24-hour with stray seconds or single-digit hour: "9:05", "23:59:00"
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return { time: null, ok: false, changed: true };
    return { time: `${pad(h)}:${pad(min)}`, ok: true, changed: true };
  }

  // Compact: "2359", "900"
  m = s.match(/^(\d{3,4})$/);
  if (m) {
    const n = m[1].padStart(4, '0');
    const h = Number(n.slice(0, 2));
    const min = Number(n.slice(2));
    if (h <= 23 && min <= 59) return { time: `${pad(h)}:${pad(min)}`, ok: true, changed: true };
    return { time: null, ok: false, changed: true };
  }

  // Bare hour in 24h form: "18"
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const h = Number(m[1]);
    if (h <= 23) return { time: `${pad(h)}:00`, ok: true, changed: true };
  }

  return { time: null, ok: false, changed: true };
}

/**
 * Normalise in place on a draft/payload object. When the value cannot be
 * understood it becomes null and `deadline_time` joins needs_review.
 */
export function normalizeDeadlineTime(obj) {
  if (!obj || !('deadline_time' in obj)) return obj;
  const { time, ok } = normalizeTime(obj.deadline_time);
  obj.deadline_time = time;
  if (!ok) {
    const nr = new Set(Array.isArray(obj.needs_review) ? obj.needs_review : []);
    nr.add('deadline_time');
    obj.needs_review = [...nr];
  }
  return obj;
}

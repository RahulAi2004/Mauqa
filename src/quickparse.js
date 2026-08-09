// Instant local parser for the quick-add bar. Understands English + Roman Urdu:
// "physics test friday 9am", "meeting with client kal 3pm", "bijli ka bill 5 aug",
// "gym har roz 7am". The AI endpoint (/api/quickparse) is the smarter fallback for
// messy lines when a key is configured — this one gives live-as-you-type feedback.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

const TYPE_WORDS = [
  ['meeting', ['meeting', 'meet ', 'call with', 'interview', 'appointment', 'milna', 'mulaqat', 'demo', 'standup']],
  ['test', ['test', 'exam', 'quiz', 'paper', 'mids', 'finals', 'viva', 'imtihan']],
  ['assignment', ['assignment', 'submit', 'submission', 'homework', 'project due', 'due date', 'report due']],
  ['bill', ['bill', 'payment', 'pay ', 'fee', 'fees', 'recharge', 'installment', 'qist', 'rent']],
  ['event', ['event', 'party', 'birthday', 'shaadi', 'wedding', 'seminar', 'conference', 'concert']],
  ['opportunity', ['internship', 'scholarship', 'apply', 'application', 'job ', 'hackathon', 'admission']],
  ['task', ['task', 'todo', 'buy ', 'khareed', 'karna hai', 'complete ', 'finish ']],
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseQuick(raw) {
  let text = ` ${raw.trim()} `;
  const now = new Date();
  const result = { title: '', item_type: 'task', deadline: null, deadline_time: null, recurrence: 'none' };
  const eat = (match) => { text = text.replace(match, ' '); };

  // --- recurrence ---
  let m = text.match(/\b(every ?day|daily|rozana|har roz)\b/i);
  if (m) { result.recurrence = 'daily'; eat(m[0]); }
  if (!m && (m = text.match(/\b(every ?week|weekly|har hafta)\b/i))) { result.recurrence = 'weekly'; eat(m[0]); }
  if (!m && (m = text.match(/\b(every ?month|monthly|har mah?in[ae]y?)\b/i))) { result.recurrence = 'monthly'; eat(m[0]); }
  m = text.match(new RegExp(`\\b(?:every|har)\\s+(${Object.keys(DAYS).join('|')})\\b`, 'i'));
  if (m) {
    result.recurrence = 'weekly';
    result.deadline = nextDay(now, DAYS[m[1].toLowerCase()]);
    eat(m[0]);
  }

  // --- time ---
  m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    result.deadline_time = `${pad(h)}:${pad(Number(m[2] || 0))}`;
    eat(m[0]);
  } else if ((m = text.match(/(?:\bat |@)(\d{1,2})(?::(\d{2}))?\b/i))) {
    let h = Number(m[1]);
    if (h >= 1 && h <= 7) h += 12; // "at 3" almost always means 3pm
    result.deadline_time = `${pad(h)}:${pad(Number(m[2] || 0))}`;
    eat(m[0]);
  } else if ((m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) {
    result.deadline_time = `${pad(Number(m[1]))}:${m[2]}`;
    eat(m[0]);
  }

  // --- date ---
  if (!result.deadline) {
    if ((m = text.match(/\b(day after tomorrow|parso+n?)\b/i))) {
      result.deadline = addDays(now, 2); eat(m[0]);
    } else if ((m = text.match(/\b(tomorrow|tmrw|kal)\b/i))) {
      result.deadline = addDays(now, 1); eat(m[0]);
    } else if ((m = text.match(/\b(today|aaj|tonight)\b/i))) {
      result.deadline = addDays(now, 0); eat(m[0]);
    } else if ((m = text.match(/\bnext week\b/i))) {
      result.deadline = addDays(now, 7); eat(m[0]);
    } else if ((m = text.match(new RegExp(`\\b(?:next\\s+|on\\s+)?(${Object.keys(DAYS).join('|')})\\b`, 'i')))) {
      result.deadline = nextDay(now, DAYS[m[1].toLowerCase()]); eat(m[0]);
    } else if ((m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/))) {
      result.deadline = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; eat(m[0]);
    } else if ((m = text.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](20\d{2}))?\b/))) {
      const y = m[3] ? Number(m[3]) : yearFor(now, Number(m[2]), Number(m[1]));
      result.deadline = `${y}-${pad(m[2])}-${pad(m[1])}`; eat(m[0]);
    } else {
      const monthNames = Object.keys(MONTHS).join('|');
      m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[a-z]*\\.?,?\\s*(20\\d{2})?\\b`, 'i'))
        || text.match(new RegExp(`\\b(${monthNames})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(20\\d{2})?\\b`, 'i'));
      if (m) {
        let day, monKey, year;
        if (/^\d/.test(m[1])) { day = Number(m[1]); monKey = m[2].slice(0, 3).toLowerCase(); year = m[3]; }
        else { monKey = m[1].slice(0, 3).toLowerCase(); day = Number(m[2]); year = m[3]; }
        const mon = MONTHS[monKey];
        if (mon && day >= 1 && day <= 31) {
          const y = year ? Number(year) : yearFor(now, mon, day);
          result.deadline = `${y}-${pad(mon)}-${pad(day)}`;
          eat(m[0]);
        }
      }
    }
  }

  // If a time was given but no date, assume today (or tomorrow if that time already passed)
  if (result.deadline_time && !result.deadline) {
    const [h, min] = result.deadline_time.split(':').map(Number);
    const candidate = new Date(now); candidate.setHours(h, min, 0, 0);
    result.deadline = addDays(now, candidate > now ? 0 : 1);
  }

  // --- item type ---
  const lower = ` ${raw.toLowerCase()} `;
  for (const [type, words] of TYPE_WORDS) {
    if (words.some((w) => lower.includes(w))) { result.item_type = type; break; }
  }

  // --- title cleanup ---
  result.title = text
    .replace(/\b(remind me (?:to|about|of)?|yaad dilana|reminder)\b/gi, ' ')
    .replace(/\s+(on|at|by|ko|se|for)\s*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[-–—:,.]+|[-–—:,.]+$/g, '')
    .trim();
  if (!result.title) result.title = raw.trim();
  result.title = result.title.charAt(0).toUpperCase() + result.title.slice(1);

  return result;
}

function addDays(now, days) {
  const d = new Date(now); d.setDate(d.getDate() + days); return iso(d);
}

function nextDay(now, target) {
  const d = new Date(now);
  let diff = (target - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return iso(d);
}

function yearFor(now, mon, day) {
  const y = now.getFullYear();
  const candidate = new Date(y, mon - 1, day, 23, 59);
  return candidate < now ? y + 1 : y;
}

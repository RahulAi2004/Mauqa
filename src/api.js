async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// UI prefs applied globally (set by App after loading settings)
export const uiPrefs = { time_24h: false, week_start: 0 };

export const api = {
  me: () => req('/api/auth/me'),
  updateProfile: (payload) => req('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  signup: (payload) => req('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => req('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  status: () => req('/api/status'),
  settings: () => req('/api/settings'),
  saveSettings: (payload) => req('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  quickparse: (text) => req('/api/quickparse', { method: 'POST', body: JSON.stringify({ text }) }),
  extract: (payload) => req('/api/extract', { method: 'POST', body: JSON.stringify(payload) }),
  list: () => req('/api/opportunities'),
  create: (payload) => req('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => req(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (id) => req(`/api/opportunities/${id}`, { method: 'DELETE' }),
  notifications: () => req('/api/notifications'),
  ackNotifications: (ids) => req('/api/notifications/ack', { method: 'POST', body: JSON.stringify({ ids }) }),
  snooze: (id, minutes) => req('/api/notifications/snooze', { method: 'POST', body: JSON.stringify({ id, minutes }) }),
};

// ---------- Android app ----------
// Set VITE_APK_URL in .env and rebuild once the APK is hosted; nothing here
// needs editing. Empty means "no APK published yet" and every download
// affordance stays hidden rather than shipping a dead link.
// Vite only exposes VITE_-prefixed vars to the browser, so the server's
// OPENROUTER_API_KEY in the same .env is never bundled.
export const APK_URL = (import.meta.env.VITE_APK_URL || '').trim();

export const isAndroid = () => /android/i.test(navigator.userAgent);

// ---------- shared constants ----------

export const TYPES = [
  { key: 'meeting', label: 'Meeting', emoji: '🤝' },
  { key: 'test', label: 'Test / Exam', emoji: '📝' },
  { key: 'assignment', label: 'Assignment', emoji: '📚' },
  { key: 'bill', label: 'Bill / Payment', emoji: '💳' },
  { key: 'task', label: 'Task', emoji: '✅' },
  { key: 'event', label: 'Event', emoji: '🎉' },
  { key: 'opportunity', label: 'Opportunity', emoji: '🎯' },
  { key: 'other', label: 'Other', emoji: '📌' },
];

export const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.key, t]));

// Categorical colors live as CSS variables so the dark theme swaps them automatically.
export const typeColor = (key) => `var(--cat-${TYPE_MAP[key] ? key : 'other'})`;

export const OFFSET_CHOICES = [
  { m: 0, label: 'At the time' },
  { m: 10, label: '10 min before' },
  { m: 15, label: '15 min before' },
  { m: 30, label: '30 min before' },
  { m: 60, label: '1 hour before' },
  { m: 180, label: '3 hours before' },
  { m: 1440, label: '1 day before' },
  { m: 2880, label: '2 days before' },
  { m: 4320, label: '3 days before' },
  { m: 10080, label: '1 week before' },
];

export function offsetLabel(m) {
  return OFFSET_CHOICES.find((o) => o.m === m)?.label
    || (m < 60 ? `${m} min before` : m < 1440 ? `${Math.round(m / 60)}h before` : `${Math.round(m / 1440)}d before`);
}

export const PERSONAS = [
  { key: 'student', label: 'Student', emoji: '🎓', blurb: 'Tests, assignments, scholarships, fee deadlines', defaultType: 'test' },
  { key: 'professional', label: 'Professional', emoji: '💼', blurb: 'Meetings, follow-ups, deadlines, interviews', defaultType: 'meeting' },
  { key: 'business', label: 'Business owner', emoji: '🏢', blurb: 'Client meetings, payments, orders, renewals', defaultType: 'meeting' },
  { key: 'freelancer', label: 'Freelancer', emoji: '🚀', blurb: 'Client work, deliverables, invoices, follow-ups', defaultType: 'task' },
  { key: 'general', label: 'Other / everything', emoji: '✨', blurb: 'Bills, events, tasks — life ke saare reminders', defaultType: 'task' },
];

// ---------- date helpers ----------

export function daysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${deadline}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

export function fmtDeadline(deadline) {
  if (!deadline) return 'No date';
  return new Date(`${deadline}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (uiPrefs.time_24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ampm}` : `${h12} ${ampm}`;
}

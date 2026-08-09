import './env.js'; // MUST be first — loads .env before other modules read process.env
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  listOpportunities, getOpportunity, createOpportunity, updateOpportunity,
  deleteOpportunity, replaceReminders, dueReminders, ackReminders, snoozeReminder,
  expiredRecurring, counts, getSettings, setSettings,
} from './db.js';
import { attachUser, requireAuth, authRoutes, setPersona, getPersona } from './auth.js';
import { extractWithAI, extractMock, quickParseAI, aiMode, aiInfo } from './extract.js';
import { fetchMeta, detectPlatform } from './fetchMeta.js';
import { buildIcs } from './ics.js';
import { isValidTime, normalizeDate, normalizeTime } from './time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Hosts (Render, Railway, Fly) inject the port to bind as PORT and fail the
// health check if we listen anywhere else. Locally PORT belongs to Vite, so the
// dev script pins API_PORT — which wins here — and this falls back to PORT only
// when nothing else said otherwise.
const PORT = process.env.API_PORT || process.env.PORT || 4200;
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(attachUser);

// ---------- reminder computation ----------
// Offsets are MINUTES before the deadline moment (deadline_time, else 09:00).
export const DEFAULT_OFFSETS = {
  meeting: [1440, 60, 15],
  test: [10080, 4320, 1440],
  assignment: [4320, 1440, 60],
  bill: [4320, 1440],
  task: [1440, 60],
  event: [1440, 60],
  opportunity: [10080, 4320, 1440, 0],
  other: [1440],
};

function offsetLabel(minutes) {
  if (minutes === 0) return 'It’s time!';
  if (minutes < 60) return `${minutes} min to go`;
  if (minutes < 1440) { const h = Math.round(minutes / 60); return `${h} hour${h > 1 ? 's' : ''} to go`; }
  const d = Math.round(minutes / 1440);
  return `${d} day${d > 1 ? 's' : ''} left`;
}

function computeReminders(deadline, deadline_time, offsets = [], custom = []) {
  const out = [];
  if (deadline) {
    // Last line of defence: anything not strictly HH:mm (including legacy rows
    // written before normalisation existed) falls back to 09:00 rather than
    // producing an Invalid Date and silently generating zero reminders.
    const at = isValidTime(deadline_time) ? deadline_time : '09:00';
    const base = new Date(`${deadline}T${at}:00`);
    for (const mins of offsets) {
      const d = new Date(base.getTime() - mins * 60000);
      if (d.getTime() > Date.now()) out.push({ remind_at: localIso(d), label: offsetLabel(mins) });
    }
  }
  for (const iso of custom) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
      out.push({ remind_at: localIso(d), label: 'Custom reminder' });
    }
  }
  return out;
}

function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

const todayLocal = () => localIso(new Date()).slice(0, 10);

function reminderDefaults(userId) {
  const s = getSettings(userId);
  return { ...DEFAULT_OFFSETS, ...(s.reminder_defaults || {}) };
}

function rollRecurring(userId) {
  const today = todayLocal();
  for (const item of expiredRecurring(today, userId)) {
    const d = new Date(`${item.deadline}T00:00:00`);
    const step = { daily: () => d.setDate(d.getDate() + 1), weekly: () => d.setDate(d.getDate() + 7), monthly: () => d.setMonth(d.getMonth() + 1) }[item.recurrence];
    if (!step) continue;
    let guard = 0;
    while (localIso(d).slice(0, 10) < today && guard++ < 1000) step();
    const newDeadline = localIso(d).slice(0, 10);
    updateOpportunity(item.id, userId, { deadline: newDeadline });
    const offsets = item.reminder_offsets?.length ? item.reminder_offsets : reminderDefaults(userId)[item.item_type] || [1440];
    replaceReminders(item.id, computeReminders(newDeadline, item.deadline_time, offsets, []));
  }
}

// ---------- public routes ----------

authRoutes(app);

app.get('/api/status', async (req, res) => {
  const mode = await aiMode();
  const ai = aiInfo(); // provider + model only — never the API key
  res.json({
    ok: true,
    aiMode: mode,     // kept: existing clients read these two
    model: ai.model,
    ai: {
      mode,                                          // 'live' | 'mock'
      provider: ai.configured ? ai.provider : null,  // 'openrouter' when a key is set
      model: ai.model,
      configured: ai.configured,
      reason: ai.reason,                             // no_api_key | invalid_api_key | verified | unverified_*
      fallback: ai.fallback,
    },
    ...(req.user ? counts(req.user.id) : {}),
  });
});

// ---------- everything below requires a signed-in user ----------
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/status') return next();
  requireAuth(req, res, next);
});

const DEFAULT_PREFS = {
  theme: 'light', accent: 'violet', density: 'comfortable',
  smart_suggestions: true, auto_extract: true,
  week_start: 0, time_24h: false, default_view: 'upcoming',
};

function settingsPayload(userId) {
  const s = getSettings(userId);
  return {
    persona: getPersona(userId),
    reminder_defaults: { ...DEFAULT_OFFSETS, ...(s.reminder_defaults || {}) },
    prefs: { ...DEFAULT_PREFS, ...(s.prefs || {}) },
  };
}

app.get('/api/settings', (req, res) => {
  res.json(settingsPayload(req.user.id));
});

app.put('/api/settings', (req, res) => {
  const { persona, reminder_defaults, prefs } = req.body || {};
  if (persona !== undefined) setPersona(req.user.id, persona);
  if (reminder_defaults !== undefined) setSettings(req.user.id, { reminder_defaults });
  if (prefs !== undefined) {
    const existing = getSettings(req.user.id).prefs || {};
    setSettings(req.user.id, { prefs: { ...DEFAULT_PREFS, ...existing, ...prefs } });
  }
  res.json(settingsPayload(req.user.id));
});

app.post('/api/quickparse', async (req, res) => {
  const { text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  try {
    const parsed = await quickParseAI(text.trim());
    if (!parsed) return res.status(503).json({ error: 'AI not available — use local parsing.' });
    res.json({ parsed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/extract', async (req, res) => {
  const { url, text, image, basicOnly } = req.body || {};
  if (!url && !text && !image?.data) {
    return res.status(400).json({ error: 'Provide a url, pasted text, or a screenshot.' });
  }
  const meta = url ? await fetchMeta(url) : null;
  let draft = null;
  let error = null;
  if (!basicOnly) {
    try {
      draft = await extractWithAI({ meta, text, image });
    } catch (e) {
      error = e.message;
    }
  }
  if (!draft) draft = extractMock({ meta, text });
  res.json({
    draft: {
      ...draft,
      source_url: url || null,
      source_platform: url ? detectPlatform(url) : (image?.data ? 'screenshot' : 'text'),
      source_type: image?.data ? 'screenshot' : url ? 'link' : 'text',
    },
    // `usable` distinguishes "we loaded the page" from "we learned something".
    meta: meta ? { title: meta.title, description: meta.description, image: meta.image, fetched: meta.fetched, usable: meta.usable } : null,
    aiError: error,
  });
});

app.get('/api/opportunities', (req, res) => {
  rollRecurring(req.user.id);
  res.json(listOpportunities(req.user.id));
});

app.post('/api/opportunities', (req, res) => {
  const { opportunity, reminderOffsets, customReminders = [] } = req.body || {};
  if (!opportunity?.title) return res.status(400).json({ error: 'title is required' });
  // deadline drives every reminder, countdown and .ics line — a value that is not
  // a real YYYY-MM-DD must never reach the database, or it silently becomes zero
  // reminders, "Invalid Date" on screen and a DTSTART of NaN.
  if ('deadline' in opportunity) {
    const { date, ok } = normalizeDate(opportunity.deadline);
    opportunity.deadline = date;
    if (!ok) opportunity.needs_review = [...new Set([...(opportunity.needs_review || []), 'deadline'])];
  }
  if ('deadline_time' in opportunity) {
    const { time, ok } = normalizeTime(opportunity.deadline_time);
    opportunity.deadline_time = time;
    if (!ok) opportunity.needs_review = [...new Set([...(opportunity.needs_review || []), 'deadline_time'])];
  }
  if ('event_date' in opportunity) {
    const { date, ok } = normalizeDate(opportunity.event_date);
    opportunity.event_date = date;
    if (!ok) opportunity.needs_review = [...new Set([...(opportunity.needs_review || []), 'event_date'])];
  }
  const offsets = reminderOffsets ?? reminderDefaults(req.user.id)[opportunity.item_type || 'other'] ?? [1440];
  const id = createOpportunity(req.user.id, { ...opportunity, reminder_offsets: offsets });
  replaceReminders(id, computeReminders(opportunity.deadline, opportunity.deadline_time, offsets, customReminders));
  res.status(201).json(getOpportunity(id, req.user.id));
});

app.patch('/api/opportunities/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getOpportunity(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { reminderOffsets, customReminders, ...fields } = req.body || {};
  if ('deadline' in fields) {
    const { date, ok } = normalizeDate(fields.deadline);
    fields.deadline = date;
    if (!ok) fields.needs_review = [...new Set([...(fields.needs_review || existing.needs_review || []), 'deadline'])];
  }
  if ('deadline_time' in fields) {
    const { time, ok } = normalizeTime(fields.deadline_time);
    fields.deadline_time = time;
    if (!ok) fields.needs_review = [...new Set([...(fields.needs_review || existing.needs_review || []), 'deadline_time'])];
  }
  if ('event_date' in fields) {
    const { date, ok } = normalizeDate(fields.event_date);
    fields.event_date = date;
    if (!ok) fields.needs_review = [...new Set([...(fields.needs_review || existing.needs_review || []), 'event_date'])];
  }
  if (reminderOffsets !== undefined) fields.reminder_offsets = reminderOffsets;
  const updated = updateOpportunity(id, req.user.id, fields);
  const scheduleChanged = reminderOffsets !== undefined || customReminders !== undefined
    || fields.deadline !== undefined || fields.deadline_time !== undefined;
  if (scheduleChanged) {
    const offsets = reminderOffsets ?? updated.reminder_offsets ?? [];
    replaceReminders(id, computeReminders(updated.deadline, updated.deadline_time, offsets, customReminders ?? []));
  }
  res.json(getOpportunity(id, req.user.id));
});

app.delete('/api/opportunities/:id', (req, res) => {
  deleteOpportunity(Number(req.params.id), req.user.id);
  res.status(204).end();
});

app.get('/api/notifications', (req, res) => {
  res.json(dueReminders(localIso(new Date()), req.user.id));
});

app.post('/api/notifications/ack', (req, res) => {
  ackReminders(req.body?.ids || [], req.user.id);
  res.json({ ok: true });
});

app.post('/api/notifications/snooze', (req, res) => {
  const { id, minutes } = req.body || {};
  if (!id || !minutes) return res.status(400).json({ error: 'id and minutes required' });
  snoozeReminder(id, localIso(new Date(Date.now() + minutes * 60000)), req.user.id);
  res.json({ ok: true });
});

app.get('/api/opportunities/:id/ics', (req, res) => {
  const opp = getOpportunity(Number(req.params.id), req.user.id);
  if (!opp) return res.status(404).json({ error: 'not found' });
  const ics = buildIcs(opp);
  if (!ics) return res.status(400).json({ error: 'This item has no date set.' });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mauqa-${opp.id}.ics"`);
  res.send(ics);
});

app.get('/api/export', (req, res) => {
  const rows = listOpportunities(req.user.id);
  if ((req.query.format || 'json') === 'csv') {
    const cols = ['id', 'title', 'item_type', 'organization', 'category', 'deadline', 'deadline_time', 'event_date', 'recurrence',
      'apply_link', 'location', 'compensation', 'status', 'priority', 'tags', 'source_url', 'summary', 'created_at'];
    const esc = (v) => {
      let s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula-injection guard
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mauqa-export.csv"');
    return res.send(csv);
  }
  res.setHeader('Content-Disposition', 'attachment; filename="mauqa-export.json"');
  res.json(rows);
});

// unknown API routes get JSON, not the SPA shell
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// ---------- static frontend (production build) ----------
const dist = path.join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, async () => {
  console.log(`Mauqa API on http://localhost:${PORT}  (AI: ${await aiMode()})`);
});

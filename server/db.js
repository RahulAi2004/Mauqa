import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'mauqa.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    organization TEXT,
    category TEXT DEFAULT 'other',
    deadline TEXT,
    deadline_time TEXT,
    apply_link TEXT,
    location TEXT,
    compensation TEXT,
    requirements TEXT DEFAULT '[]',
    summary TEXT,
    notes TEXT,
    tags TEXT DEFAULT '[]',
    source_url TEXT,
    source_platform TEXT,
    source_type TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    confidence TEXT DEFAULT '{}',
    needs_review TEXT DEFAULT '[]',
    extraction_mode TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    remind_at TEXT NOT NULL,
    label TEXT,
    notified INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(notified, remind_at);
`);

// ---- migrations (idempotent) ----
const tryExec = (sql) => { try { db.exec(sql); } catch { /* already applied */ } };
tryExec(`ALTER TABLE opportunities ADD COLUMN item_type TEXT DEFAULT 'opportunity'`);
tryExec(`ALTER TABLE opportunities ADD COLUMN recurrence TEXT DEFAULT 'none'`);
tryExec(`ALTER TABLE opportunities ADD COLUMN reminder_offsets TEXT DEFAULT '[]'`);
tryExec(`ALTER TABLE opportunities ADD COLUMN user_id INTEGER`);
tryExec(`ALTER TABLE opportunities ADD COLUMN requirements_done TEXT DEFAULT '[]'`);
// eligibility = criteria that decide WHO may apply. requirements stays as the
// documents/actions the applicant must produce. Old rows keep their mixed
// requirements untouched and simply report eligibility = [].
tryExec(`ALTER TABLE opportunities ADD COLUMN eligibility TEXT DEFAULT '[]'`);
// event_date = when the thing actually happens/starts. Distinct from deadline,
// which is when you must have applied. Nullable; old rows read back as null.
tryExec(`ALTER TABLE opportunities ADD COLUMN event_date TEXT`);
db.exec(`UPDATE opportunities SET status = 'pending' WHERE status IN ('saved','reviewing','ready','waiting')`);
db.exec(`UPDATE opportunities SET status = 'done' WHERE status = 'applied'`);
db.exec(`UPDATE opportunities SET status = 'missed' WHERE status = 'closed'`);

// settings became per-user; migrate the old (key PK) table shape if present
const settingsCols = (() => { try { return db.prepare(`PRAGMA table_info(settings)`).all().map((c) => c.name); } catch { return []; } })();
if (settingsCols.length && !settingsCols.includes('user_id')) {
  db.exec(`ALTER TABLE settings RENAME TO settings_old`);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);
tryExec(`INSERT INTO settings (user_id, key, value) SELECT NULL, key, value FROM settings_old`);
tryExec(`DROP TABLE settings_old`);

// ---------- settings (per user) ----------
export function getSettings(userId) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id IS ?').all(userId ?? null);
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
  return out;
}

export function setSettings(userId, obj) {
  const stmt = db.prepare('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) stmt.run(userId ?? null, k, JSON.stringify(v));
  return getSettings(userId);
}

// ---------- items (all scoped to a user) ----------
const parseRow = (row) => row && ({
  ...row,
  requirements: JSON.parse(row.requirements || '[]'),
  eligibility: JSON.parse(row.eligibility || '[]'),
  tags: JSON.parse(row.tags || '[]'),
  confidence: JSON.parse(row.confidence || '{}'),
  needs_review: JSON.parse(row.needs_review || '[]'),
  reminder_offsets: JSON.parse(row.reminder_offsets || '[]'),
  requirements_done: JSON.parse(row.requirements_done || '[]'),
});

export function listOpportunities(userId) {
  const rows = db.prepare('SELECT * FROM opportunities WHERE user_id = ? ORDER BY (deadline IS NULL), deadline ASC, deadline_time ASC, created_at DESC').all(userId);
  const reminderRows = db.prepare(
    'SELECT r.* FROM reminders r JOIN opportunities o ON o.id = r.opportunity_id WHERE o.user_id = ? ORDER BY r.remind_at ASC'
  ).all(userId);
  const byOpp = {};
  for (const r of reminderRows) (byOpp[r.opportunity_id] ||= []).push(r);
  return rows.map(parseRow).map((o) => ({ ...o, reminders: byOpp[o.id] || [] }));
}

export function getOpportunity(id, userId) {
  const row = db.prepare('SELECT * FROM opportunities WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) return null;
  const o = parseRow(row);
  o.reminders = db.prepare('SELECT * FROM reminders WHERE opportunity_id = ? ORDER BY remind_at ASC').all(id);
  return o;
}

const FIELDS = ['title', 'organization', 'category', 'deadline', 'deadline_time', 'event_date', 'apply_link',
  'location', 'compensation', 'summary', 'notes', 'source_url', 'source_platform',
  'source_type', 'status', 'priority', 'extraction_mode', 'item_type', 'recurrence'];
const JSON_FIELDS = ['requirements', 'eligibility', 'tags', 'confidence', 'needs_review', 'reminder_offsets', 'requirements_done'];

export function createOpportunity(userId, data) {
  const cols = ['user_id'], vals = [userId];
  for (const f of FIELDS) if (data[f] !== undefined) { cols.push(f); vals.push(data[f] === '' ? null : data[f]); }
  for (const f of JSON_FIELDS) if (data[f] !== undefined) { cols.push(f); vals.push(JSON.stringify(data[f])); }
  const stmt = db.prepare(`INSERT INTO opportunities (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  const { lastInsertRowid } = stmt.run(...vals);
  return Number(lastInsertRowid);
}

export function updateOpportunity(id, userId, data) {
  const sets = [], vals = [];
  for (const f of FIELDS) if (data[f] !== undefined) { sets.push(`${f} = ?`); vals.push(data[f] === '' ? null : data[f]); }
  for (const f of JSON_FIELDS) if (data[f] !== undefined) { sets.push(`${f} = ?`); vals.push(JSON.stringify(data[f])); }
  if (!sets.length) return getOpportunity(id, userId);
  sets.push(`updated_at = datetime('now')`);
  db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
  return getOpportunity(id, userId);
}

export function deleteOpportunity(id, userId) {
  const owned = db.prepare('SELECT id FROM opportunities WHERE id = ? AND user_id = ?').get(id, userId);
  if (!owned) return;
  db.prepare('DELETE FROM reminders WHERE opportunity_id = ?').run(id);
  db.prepare('DELETE FROM opportunities WHERE id = ?').run(id);
}

export function replaceReminders(oppId, reminders) {
  db.prepare('DELETE FROM reminders WHERE opportunity_id = ?').run(oppId);
  const stmt = db.prepare('INSERT INTO reminders (opportunity_id, remind_at, label) VALUES (?, ?, ?)');
  for (const r of reminders) stmt.run(oppId, r.remind_at, r.label || null);
}

export function expiredRecurring(todayIso, userId) {
  return db.prepare(`
    SELECT * FROM opportunities
    WHERE user_id = ? AND recurrence != 'none' AND deadline IS NOT NULL AND deadline < ? AND status = 'pending'
  `).all(userId, todayIso).map(parseRow);
}

export function dueReminders(nowIso, userId) {
  return db.prepare(`
    SELECT r.id, r.remind_at, r.label, o.id AS opportunity_id, o.title, o.item_type,
           o.deadline, o.deadline_time, o.priority, o.apply_link
    FROM reminders r JOIN opportunities o ON o.id = r.opportunity_id
    WHERE o.user_id = ? AND r.notified = 0 AND r.remind_at <= ? AND o.status = 'pending'
    ORDER BY r.remind_at ASC
  `).all(userId, nowIso);
}

export function ackReminders(ids, userId) {
  const stmt = db.prepare(`
    UPDATE reminders SET notified = 1
    WHERE id = ? AND opportunity_id IN (SELECT id FROM opportunities WHERE user_id = ?)
  `);
  for (const id of ids) stmt.run(id, userId);
}

export function snoozeReminder(id, untilIso, userId) {
  db.prepare(`
    UPDATE reminders SET remind_at = ?, notified = 0
    WHERE id = ? AND opportunity_id IN (SELECT id FROM opportunities WHERE user_id = ?)
  `).run(untilIso, id, userId);
}

export function counts(userId) {
  return {
    total: db.prepare('SELECT COUNT(*) c FROM opportunities WHERE user_id = ?').get(userId).c,
    reminders: db.prepare(`
      SELECT COUNT(*) c FROM reminders r JOIN opportunities o ON o.id = r.opportunity_id
      WHERE o.user_id = ? AND r.notified = 0
    `).get(userId).c,
  };
}

// Local authentication: scrypt-hashed passwords + httpOnly session cookies.
// No external services — accounts live in the same SQLite file as everything else.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const SESSION_DAYS = 90;
const COOKIE = 'mauqa_session';

// Simple in-memory rate limit for credential endpoints (brute-force guard).
const attempts = new Map(); // key -> {n, resetAt}
function rateLimited(key, max = 15, windowMs = 5 * 60000) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) { attempts.set(key, { n: 1, resetAt: now + windowMs }); return false; }
  rec.n += 1;
  return rec.n > max;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    persona TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
`);

// prune expired sessions on boot so the table doesn't grow forever
db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run();

// ---------- password hashing ----------

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---------- sessions ----------

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.persona FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Secure only in production: a deployed Mauqa is always HTTPS, while local dev
// runs on plain http://localhost, where a Secure cookie would never be stored.
// SameSite stays Lax so the Android share sheet (a top-level GET navigation into
// /?text=…) still arrives signed in.
const cookieFlags = () =>
  `HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieFlags()}; Max-Age=${SESSION_DAYS * 86400}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieFlags()}; Max-Age=0`);
}

// ---------- middleware ----------

export function attachUser(req, _res, next) {
  req.user = sessionUser(parseCookies(req)[COOKIE]);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

// The very first account adopts any items/settings created before auth existed,
// so nothing saved in the pre-auth version is lost.
function claimOrphans(userId) {
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount !== 1) return;
  db.prepare('UPDATE opportunities SET user_id = ? WHERE user_id IS NULL').run(userId);
  try {
    const legacy = db.prepare(`SELECT value FROM settings WHERE key = 'reminder_defaults' AND user_id IS NULL`).get();
    if (legacy) {
      db.prepare(`UPDATE settings SET user_id = ? WHERE user_id IS NULL`).run(userId);
    }
  } catch { /* settings table may already be per-user only */ }
}

// ---------- routes ----------

export function authRoutes(app) {
  app.post('/api/auth/signup', (req, res) => {
    if (rateLimited(`signup:${req.ip}`)) return res.status(429).json({ error: 'Too many attempts — try again in a few minutes.' });
    const { name, email, password, persona } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 6–128 characters.' });
    }
    if (name.trim().length > 100 || email.trim().length > 254) return res.status(400).json({ error: 'Name or email is too long.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'That email doesn’t look right.' });
    try {
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO users (name, email, pass_hash, persona) VALUES (?, ?, ?, ?)'
      ).run(name.trim(), email.trim().toLowerCase(), hashPassword(password), persona || 'general');
      const userId = Number(lastInsertRowid);
      claimOrphans(userId);
      setSessionCookie(res, createSession(userId));
      res.status(201).json({ user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), persona: persona || 'general' } });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists — try logging in.' });
      throw e;
    }
  });

  app.post('/api/auth/login', (req, res) => {
    if (rateLimited(`login:${req.ip}`)) return res.status(429).json({ error: 'Too many attempts — try again in a few minutes.' });
    const { email, password } = req.body || {};
    if (typeof password !== 'string' || password.length > 128) return res.status(401).json({ error: 'Wrong email or password.' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
    if (!user || !verifyPassword(password || '', user.pass_hash)) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    setSessionCookie(res, createSession(user.id));
    res.json({ user: { id: user.id, name: user.name, email: user.email, persona: user.persona } });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    res.json({ user: req.user });
  });

  app.patch('/api/auth/profile', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), req.user.id);
    res.json({ user: { ...req.user, name: name.trim() } });
  });
}

export function setPersona(userId, persona) {
  db.prepare('UPDATE users SET persona = ? WHERE id = ?').run(persona, userId);
}

export function getPersona(userId) {
  return db.prepare('SELECT persona FROM users WHERE id = ?').get(userId)?.persona || null;
}

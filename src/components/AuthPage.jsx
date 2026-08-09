import React, { useState } from 'react';
import { api, PERSONAS } from '../api.js';

const strengthOf = (pw) => {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0..4
};
const S_LABEL = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];
const S_COLOR = ['var(--bad)', 'var(--bad)', 'var(--warn)', 'var(--good)', 'var(--good)'];

export default function AuthPage({ onAuthed, onInstall }) {
  const [tab, setTab] = useState('signup');
  const [step, setStep] = useState(1); // signup: 1 account → 2 role → 3 setup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [persona, setPersona] = useState(null);
  const [createdUser, setCreatedUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const strength = strengthOf(password);

  const login = async () => {
    setBusy(true); setError(null);
    try {
      const { user } = await api.login({ email, password });
      onAuthed(user, false);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const toRole = () => {
    setError(null);
    if (!name.trim()) return setError('Apna naam batao — what should we call you?');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('That email doesn’t look right.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setStep(2);
  };

  const pickRole = async (key) => {
    setPersona(key);
    setBusy(true); setError(null);
    try {
      const { user } = await api.signup({ name, email, password, persona: key });
      setCreatedUser(user);
      setStep(3);
    } catch (e) { setError(e.message); setStep(1); }
    setBusy(false);
  };

  const enableNotifs = () => {
    if ('Notification' in window) Notification.requestPermission();
  };

  const onKey = (e, fn) => { if (e.key === 'Enter') fn(); };

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="logo-line"><img src="/icon.svg" alt="" /><span>MAUQA</span></div>
        <h1>Save the opportunity. <em>Mauqa does the rest.</em></h1>
        <p>Share a scholarship, internship, hackathon or job post — Mauqa reads it, pulls out the deadline, eligibility and required documents, and reminds you before it closes. Your meetings, tests and bills live here too.</p>
        <div className="hero-feats">
          <div className="hero-feat"><strong>🎯 Opportunities</strong>Scholarships, internships, hackathons — tracked to the deadline.</div>
          <div className="hero-feat"><strong>✨ AI Extract</strong>Share a reel, link or screenshot; we fill in the details.</div>
          <div className="hero-feat"><strong>🔔 Smart Reminders</strong>Deadline, documents, next steps — on time, every time.</div>
          <div className="hero-feat"><strong>🛡 Private & Secure</strong>Your data stays yours — export anytime.</div>
        </div>
        <div className="hero-sample">
          <div className="hs-tile">🎓</div>
          <div><strong>HEC Overseas Scholarship 2026</strong><span>Closes in 6 days · 3 documents left</span></div>
          <span className="hs-badge">🔔 4 reminders set</span>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          {tab === 'signup' && (
            <div className="wizard-steps">
              {[['1', 'Account'], ['2', 'Role'], ['3', 'Setup']].map(([n, l], i) => (
                <React.Fragment key={n}>
                  {i > 0 && <span className="bar wstep" style={{ width: 26, height: 2, background: step > i ? 'var(--primary)' : 'var(--border)' }} />}
                  <span className={`wstep ${step > i + 1 ? 'done' : ''} ${step === i + 1 ? 'now' : ''}`}>
                    <span className="dot">{step > i + 1 ? '✓' : n}</span> {l}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {tab === 'login' ? (
            <>
              <h2>Welcome back 👋</h2>
              <p className="sub">Log in to your MAUQA account</p>
              <label>Email</label>
              <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => onKey(e, login)} placeholder="you@example.com" />
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => onKey(e, login)} placeholder="••••••••" />
              {error && <p className="error">{error}</p>}
              <button className="btn primary wide" style={{ marginTop: 16 }} disabled={busy} onClick={login}>{busy ? 'Signing in…' : 'Log in'}</button>
              <p className="auth-switch">Don't have an account? <button className="linklike" onClick={() => { setTab('signup'); setStep(1); setError(null); }}>Sign up</button></p>
            </>
          ) : step === 1 ? (
            <>
              <h2>Get started</h2>
              <p className="sub">Create your MAUQA account — free forever.</p>
              <label>Full name</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => onKey(e, toRole)} placeholder="Enter your full name" />
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => onKey(e, toRole)} placeholder="you@example.com" />
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => onKey(e, toRole)} placeholder="Create a strong password" />
              {password && (
                <>
                  <div className="strength"><div style={{ width: `${(strength / 4) * 100}%`, background: S_COLOR[strength] }} /></div>
                  <div className="strength-label">Password strength: <strong style={{ color: S_COLOR[strength] }}>{S_LABEL[strength]}</strong></div>
                </>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn primary wide" style={{ marginTop: 16 }} onClick={toRole}>Continue →</button>
              <p className="auth-switch">Already have an account? <button className="linklike" onClick={() => { setTab('login'); setError(null); }}>Log in</button></p>
            </>
          ) : step === 2 ? (
            <>
              <h2>Who are you, {name.split(' ')[0]}?</h2>
              <p className="sub">This sets the right defaults for reminders and item types — change anytime in Settings.</p>
              <div className="persona-grid">
                {PERSONAS.map((p) => (
                  <button key={p.key} className={`persona ${persona === p.key ? 'persona-active' : ''}`} disabled={busy} onClick={() => pickRole(p.key)}>
                    <span className="persona-emoji">{p.emoji}</span>
                    <strong>{p.label}</strong>
                    <span className="muted">{p.blurb}</span>
                  </button>
                ))}
              </div>
              {busy && <p className="muted" style={{ textAlign: 'center', marginTop: 10 }}>Creating your inbox…</p>}
              {error && <p className="error">{error}</p>}
              <p className="auth-switch"><button className="linklike" onClick={() => setStep(1)}>← Back</button></p>
            </>
          ) : (
            <>
              <h2>Almost there! 🎉</h2>
              <p className="sub">A few quick things so Mauqa works at its best — all optional.</p>
              <div className="setup-row">
                <div className="s-ico">🔔</div>
                <div className="s-body"><strong>Enable notifications</strong><span>Get reminded on time with browser notifications.</span></div>
                <button className="btn small" onClick={enableNotifs}>Enable</button>
              </div>
              <div className="setup-row">
                <div className="s-ico">📲</div>
                <div className="s-body"><strong>Install Mauqa</strong><span>Quick access + Android share-sheet capture.</span></div>
                <button className="btn small" onClick={onInstall}>Install</button>
              </div>
              <div className="setup-row">
                <div className="s-ico">⏰</div>
                <div className="s-body"><strong>Smart defaults set</strong><span>Reminder schedules tuned for your role ({PERSONAS.find((p) => p.key === persona)?.label}). Customise in Settings.</span></div>
              </div>
              <button className="btn primary wide" style={{ marginTop: 18 }} onClick={() => onAuthed(createdUser, true)}>Continue →</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

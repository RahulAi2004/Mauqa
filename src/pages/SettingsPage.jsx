import React, { useState } from 'react';
import { api, TYPES, PERSONAS, OFFSET_CHOICES } from '../api.js';
import GetAppCard from '../components/GetApp.jsx';

const TABS = [
  ['prefs', 'Preferences'], ['account', 'Account'], ['notifs', 'Notifications'],
  ['data', 'Data & Privacy'], ['billing', 'Billing'],
];

const ACCENTS = [
  ['violet', '#6d28d9'], ['blue', '#2563eb'], ['green', '#059669'],
  ['orange', '#ea580c'], ['red', '#dc2626'], ['indigo', '#4f46e5'],
];

const Toggle = ({ checked, onChange }) => (
  <label className="switch">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="knob" />
  </label>
);

export default function SettingsPage({ user, settings, prefs, onPrefs, onSaved, onToast, installPrompt, onInstall, onLogout, onUserUpdate, goPremium }) {
  const [tab, setTab] = useState('prefs');
  const [persona, setPersona] = useState(settings?.persona || user.persona || 'general');
  const [defaults, setDefaults] = useState(settings?.reminder_defaults || {});
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  const setPref = async (patch) => {
    onPrefs({ ...prefs, ...patch });              // apply instantly
    const s = await api.saveSettings({ prefs: patch });  // persist
    onSaved(s, { silent: true });
  };

  const toggleOffset = (typeKey, minutes) => {
    setDefaults((d) => {
      const cur = d[typeKey] || [];
      const next = cur.includes(minutes) ? cur.filter((m) => m !== minutes) : [...cur, minutes].sort((a, b) => b - a);
      return { ...d, [typeKey]: next };
    });
  };

  const saveDefaults = async () => {
    setBusy(true);
    const s = await api.saveSettings({ persona, reminder_defaults: defaults });
    setBusy(false);
    onSaved(s);
    onToast('Settings saved ✔');
  };

  const saveProfile = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { user: u } = await api.updateProfile({ name });
    setBusy(false);
    onUserUpdate(u);
    onToast('Profile updated ✔');
  };

  const resetPrefs = () => setPref({ theme: 'light', accent: 'violet', density: 'comfortable', smart_suggestions: true, auto_extract: true, week_start: 0, time_24h: false, default_view: 'upcoming', quick_button: true });

  const testNotification = () => {
    if (!('Notification' in window)) return alert('This browser has no notification support.');
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification('Mauqa test 🔔', { body: 'Notifications are working!', icon: '/icon.svg' });
    });
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.83rem' }}>Manage your preferences, account and app settings.</p>
        </div>
        <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={resetPrefs}>↺ Reset to defaults</button>
      </div>

      <div className="set-tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'prefs' && (
        <div className="page-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <h3>Appearance</h3>
              <div className="set-row">
                <div className="sr-body"><strong>Theme</strong><span>Choose your preferred theme</span></div>
                <div className="seg">
                  {[['light', '☀️ Light'], ['dark', '🌙 Dark'], ['system', '🖥 System']].map(([v, l]) => (
                    <button key={v} className={prefs.theme === v ? 'active' : ''} onClick={() => setPref({ theme: v })}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>Accent Color</strong><span>Choose your favorite color</span></div>
                <div className="accent-dots">
                  {ACCENTS.map(([k, hex]) => (
                    <button key={k} className={`accent-dot ${prefs.accent === k ? 'active' : ''}`} style={{ background: hex }} title={k} onClick={() => setPref({ accent: k })} />
                  ))}
                </div>
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>Density</strong><span>Adjust the spacing and layout</span></div>
                <div className="seg">
                  {[['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']].map(([v, l]) => (
                    <button key={v} className={prefs.density === v ? 'active' : ''} onClick={() => setPref({ density: v })}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>General</h3>
              <div className="set-row">
                <div className="sr-body"><strong>✨ Smart Suggestions</strong><span>Show the AI parse button in quick add</span></div>
                <Toggle checked={prefs.smart_suggestions} onChange={(v) => setPref({ smart_suggestions: v })} />
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>🤖 Auto Extract</strong><span>Use AI to extract details from links and images (falls back to basic when off or no key)</span></div>
                <Toggle checked={prefs.auto_extract} onChange={(v) => setPref({ auto_extract: v })} />
              </div>
              <div className="set-row">
                <div className="sr-body">
                  <strong>🎯 Floating quick button</strong>
                  <span>
                    A draggable shortcut to Capture, quick add and Alerts. Dims while idle and
                    lights up on touch. It floats inside Mauqa only — a web app cannot draw over
                    other apps or read your screen.
                  </span>
                </div>
                <Toggle checked={prefs.quick_button !== false} onChange={(v) => setPref({ quick_button: v })} />
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>📅 Start of Week</strong><span>First day in calendars</span></div>
                <select value={prefs.week_start} onChange={(e) => setPref({ week_start: Number(e.target.value) })}>
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </select>
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>🕐 Time Format</strong><span>How times are displayed</span></div>
                <select value={prefs.time_24h ? '24' : '12'} onChange={(e) => setPref({ time_24h: e.target.value === '24' })}>
                  <option value="12">12-hour (AM/PM)</option>
                  <option value="24">24-hour</option>
                </select>
              </div>
              <div className="set-row">
                <div className="sr-body"><strong>🏠 Default Home View</strong><span>Which tab opens first</span></div>
                <select value={prefs.default_view} onChange={(e) => setPref({ default_view: e.target.value })}>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
            </div>

            <div className="card">
              <h3>Default Reminder Schedule</h3>
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 6px' }}>Applied to every new item of that type.</p>
              {TYPES.map((t) => (
                <div key={t.key} className="defaults-row">
                  <span className="defaults-type">{t.emoji} {t.label}</span>
                  <div className="defaults-chips">
                    {OFFSET_CHOICES.map((o) => (
                      <button key={o.m} className={`chip tiny ${(defaults[t.key] || []).includes(o.m) ? 'chip-active' : ''}`} onClick={() => toggleOffset(t.key, o.m)}>
                        {o.label.replace(' before', '')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn primary" disabled={busy} onClick={saveDefaults}>{busy ? 'Saving…' : '✓ Save Changes'}</button>
              </div>
            </div>
          </div>

          <div className="rail">
            <div className="card">
              <h3>Account</h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="avatar" style={{ width: 44, height: 44, fontSize: '1.1rem' }}>{user.name.charAt(0).toUpperCase()}</span>
                <div><strong style={{ fontSize: '0.9rem' }}>{user.name}</strong><div className="muted" style={{ fontSize: '0.76rem' }}>{user.email}</div></div>
              </div>
              <button className="btn small wide" style={{ marginTop: 12 }} onClick={() => setTab('account')}>✏️ Edit Profile</button>
            </div>
            <div className="card">
              <h3>App Preferences</h3>
              <div className="sum-row"><span>🌐</span> Language <span className="sum-n" style={{ fontWeight: 500, fontSize: '0.8rem' }}>English + Roman Urdu</span></div>
              <div className="sum-row"><span>🕐</span> Timezone <span className="sum-n" style={{ fontWeight: 500, fontSize: '0.8rem' }}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></div>
              <div className="sum-row"><span>🔔</span> Default reminder time <span className="sum-n" style={{ fontWeight: 500, fontSize: '0.8rem' }}>9:00 AM</span></div>
            </div>
            <GetAppCard installPrompt={installPrompt} onInstall={onInstall} />

            <div className="card">
              <h3>Other</h3>
              <p className="muted" style={{ fontSize: '0.78rem' }}>⌨️ <strong>Shortcuts:</strong> <code>/</code> quick add · <code>Ctrl+K</code> search · <code>Ctrl+Alt+M</code> global (run <code>tools\setup-hotkey.ps1</code> once)</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'account' && (
        <div className="page-grid">
          <div className="card">
            <h3>Profile</h3>
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label>Email</label>
            <input value={user.email} disabled title="Email can't be changed yet" />
            <label>I am a…</label>
            <div className="persona-row">
              {PERSONAS.map((p) => (
                <button key={p.key} className={`chip ${persona === p.key ? 'chip-active' : ''}`} onClick={() => setPersona(p.key)}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn primary" disabled={busy} onClick={async () => { await saveProfile(); await saveDefaults(); }}>✓ Save Changes</button>
            </div>
          </div>
          <div className="rail">
            <div className="card">
              <h3>Session</h3>
              <button className="btn wide danger" onClick={onLogout}>↩ Log out</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'notifs' && (
        <div className="page-grid">
          <div className="card">
            <h3>Notifications</h3>
            <div className="set-row">
              <div className="sr-body"><strong>Browser notifications</strong><span>Status: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}</span></div>
              <button className="btn small" onClick={testNotification}>🔔 Enable & test</button>
            </div>
            <div className="set-row">
              <div className="sr-body"><strong>Phone-native alarms</strong><span>Use the 📆 button on any item — the calendar file carries its reminder schedule, so your phone rings even with Mauqa closed.</span></div>
            </div>
            <div className="set-row">
              <div className="sr-body"><strong>WhatsApp reminders</strong><span>Coming with Premium (needs WhatsApp Business API).</span></div>
              <button className="btn small ghost" onClick={goPremium}>👑 Learn more</button>
            </div>
          </div>
          <div />
        </div>
      )}

      {tab === 'data' && (
        <div className="page-grid">
          <div className="card">
            <h3>Data & Privacy</h3>
            <div className="set-row">
              <div className="sr-body"><strong>Your data lives on this machine</strong><span>Everything is stored locally in SQLite — no third-party services see your reminders. Passwords are scrypt-hashed.</span></div>
            </div>
            <div className="set-row">
              <div className="sr-body"><strong>Export everything</strong><span>Take your data anywhere, anytime.</span></div>
              <a className="btn small" href="/api/export?format=csv">⬇ CSV</a>
              <a className="btn small" href="/api/export?format=json">⬇ JSON</a>
            </div>
          </div>
          <div />
        </div>
      )}

      {tab === 'billing' && (
        <div className="page-grid">
          <div className="card">
            <h3>Billing</h3>
            <div className="set-row">
              <div className="sr-body"><strong>Current plan: Free</strong><span>Unlimited reminders, AI capture, calendar export — free forever.</span></div>
              <button className="btn small primary" onClick={goPremium}>👑 View Premium</button>
            </div>
          </div>
          <div />
        </div>
      )}
    </div>
  );
}

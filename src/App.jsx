import React, { useEffect, useRef, useState } from 'react';
import { api, uiPrefs } from './api.js';
import AuthPage from './components/AuthPage.jsx';
import HomePage from './pages/HomePage.jsx';
import OpportunitiesPage from './pages/OpportunitiesPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import AddPage from './pages/AddPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PremiumPage from './pages/PremiumPage.jsx';
import DetailPage from './pages/DetailPage.jsx';
import { AppInstallBanner } from './components/GetApp.jsx';

// Primary navigation. Search, Analytics and Settings stay fully routable but move
// off the main bar (topbar search / mobile 🔍 icon / user menu) so the five slots
// lead with what Mauqa actually does.
const NAV = [
  { key: 'home', label: 'Today', icon: '🏠' },
  { key: 'opportunities', label: 'Opportunities', short: 'Opps', icon: '🎯' },
  { key: 'add', label: 'Capture', icon: '➕' },
  { key: 'calendar', label: 'Calendar', icon: '📅' },
  { key: 'notifications', label: 'Alerts', icon: '🔔' },
];

const TITLES = {
  home: 'Action Inbox', opportunities: 'Opportunities', calendar: 'Calendar', add: 'Capture',
  search: 'Search & Filters', notifications: 'Alerts', stats: 'Analytics & Insights',
  settings: 'Settings', premium: 'Go Premium', detail: 'Details',
};

const DEFAULT_PREFS = {
  theme: 'light', accent: 'violet', density: 'comfortable',
  smart_suggestions: true, auto_extract: true, week_start: 0, time_24h: false, default_view: 'upcoming',
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [page, setPage] = useState('home');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailFrom, setDetailFrom] = useState('home');
  const [sharedDraft, setSharedDraft] = useState(null);
  const [calendarDay, setCalendarDay] = useState(null);
  const [searchSeed, setSearchSeed] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [userMenu, setUserMenu] = useState(false);
  const notifiedIds = useRef(new Set());
  const quickRef = useRef(null);
  const topSearchRef = useRef(null);

  const refresh = () => api.list().then(setItems).catch(() => {});
  const refreshNotifs = () => api.notifications().then(setNotifications).catch(() => {});
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ---- apply preferences to the document ----
  useEffect(() => {
    const root = document.documentElement;
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      root.dataset.theme = prefs.theme === 'system' ? (sysDark.matches ? 'dark' : 'light') : prefs.theme;
    };
    applyTheme();
    root.dataset.accent = prefs.accent || 'violet';
    root.dataset.density = prefs.density || 'comfortable';
    uiPrefs.time_24h = !!prefs.time_24h;
    uiPrefs.week_start = prefs.week_start || 0;
    sysDark.addEventListener('change', applyTheme);
    return () => sysDark.removeEventListener('change', applyTheme);
  }, [prefs]);

  // auth check
  useEffect(() => {
    api.me().then(({ user: u }) => setUser(u)).catch(() => setUser(null)).finally(() => setAuthChecked(true));
  }, []);

  // install prompt
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // load after auth + share-target params
  useEffect(() => {
    if (!user) return;
    refresh();
    api.status().then(setStatus).catch(() => {});
    api.settings().then((s) => { setSettings(s); if (s.prefs) setPrefs({ ...DEFAULT_PREFS, ...s.prefs }); }).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const text = params.get('text');
    const title = params.get('title');
    if (url || text || title) {
      const linkInText = text?.match(/https?:\/\/\S+/)?.[0];
      // auto: the share sheet already expressed intent — Capture extracts on arrival.
      setSharedDraft({ url: url || linkInText || '', text: [title, text].filter(Boolean).join('\n'), auto: true });
      setPage('add');
      window.history.replaceState({}, '', '/');
    } else if (params.get('quick') !== null) {
      window.history.replaceState({}, '', '/');
      setPage('home');
      setTimeout(() => quickRef.current?.focus(), 300);
    }
  }, [user]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault(); setPage('home');
        setTimeout(() => quickRef.current?.focus(), 60);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (topSearchRef.current) topSearchRef.current.focus();
        else setPage('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // reminder polling
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const due = await api.notifications();
        setNotifications(due);
        if ('Notification' in window && Notification.permission === 'granted') {
          for (const n of due) {
            if (!notifiedIds.current.has(n.id)) {
              notifiedIds.current.add(n.id);
              new Notification(`Mauqa: ${n.title}`, {
                body: `${n.label}${n.deadline ? ` — ${n.deadline}${n.deadline_time ? ' ' + n.deadline_time : ''}` : ''}`,
                icon: '/icon.svg',
              });
            }
          }
        }
      } catch { /* offline */ }
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [user]);

  const install = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') { setInstallPrompt(null); showToast('Installed! 📲'); }
    } else {
      alert('To install: Chrome menu (⋮) → "Add to Home screen" (Android) or the install icon in the address bar (desktop). iPhone: Share → "Add to Home Screen".');
    }
  };

  const testNotification = () => {
    if (!('Notification' in window)) return alert('This browser has no notification support.');
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification('Mauqa test 🔔', { body: 'Notifications are working!', icon: '/icon.svg' });
    });
  };

  const logout = async () => {
    await api.logout();
    setUser(null); setItems([]); setSettings(null); setNotifications([]); setUserMenu(false); setPage('home');
    setPrefs(DEFAULT_PREFS);
  };

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    setPrefs((p) => ({ ...p, theme: next }));
    api.saveSettings({ prefs: { theme: next } }).catch(() => {});
  };

  const goEdit = (item) => { setEditItem(item); setSharedDraft(null); setPage('add'); };
  const goAdd = () => { setEditItem(null); setSharedDraft(null); setPage('add'); };
  const goDetail = (item) => { setDetailFrom(page); setDetailId(item.id); setPage('detail'); };
  const deleteFromEdit = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await api.remove(item.id);
    setEditItem(null); refresh(); setPage('home'); showToast('Deleted.');
  };

  if (!authChecked) return <div className="auth-shell" style={{ gridTemplateColumns: '1fr' }}><div className="auth-panel"><p className="muted">Loading…</p></div></div>;
  if (!user) return <AuthPage onAuthed={(u) => { setUser(u); setPage('home'); }} onInstall={install} />;

  const navCount = { notifications: notifications.length };
  const detailItem = items.find((i) => i.id === detailId);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-logo"><img src="/icon.svg" alt="" /><span>MAUQA</span></div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`}
              onClick={() => { if (n.key === 'add') goAdd(); else setPage(n.key); }}>
              <span>{n.icon}</span> {n.label}
              {navCount[n.key] > 0 && <span className="nav-badge">{navCount[n.key]}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <div className="topbar">
          <h2>
            {page === 'home' && <span className="top-count">{items.filter((i) => i.status === 'pending').length}</span>}
            {TITLES[page] || 'Mauqa'}
          </h2>
          <div className="top-search">
            <span className="mag">🔍</span>
            <input
              ref={topSearchRef}
              placeholder="Search opportunities & tasks…"
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearchSeed(e.target.value); setPage('search'); e.target.value = ''; e.target.blur(); } }}
            />
            <span className="kbd">Ctrl + K</span>
          </div>
          {/* .top-search is hidden below 760px — this keeps Search reachable on mobile */}
          <button className="icon-btn mobile-search" title="Search" onClick={() => setPage('search')}>🔍</button>
          <button className="btn primary small" onClick={goAdd}>+ Capture</button>
          <button className="bell" title="Notifications" onClick={() => setPage('notifications')}>
            🔔{notifications.length > 0 && <span className="bell-count">{notifications.length}</span>}
          </button>
          <button className="icon-btn" title="Toggle dark mode" onClick={toggleTheme}>
            {(prefs.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : prefs.theme === 'dark') ? '☀️' : '🌙'}
          </button>
          <button className="avatar-chip" onClick={() => setUserMenu(!userMenu)}>
            <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span className="avatar-meta"><strong>{user.name.split(' ')[0]}</strong><span>{user.persona}</span></span>
          </button>
          {userMenu && (
            <div className="user-menu" onMouseLeave={() => setUserMenu(false)}>
              <button onClick={() => { setPage('settings'); setUserMenu(false); }}>👤 Profile & Settings</button>
              <button onClick={() => { setPage('search'); setUserMenu(false); }}>🔍 Search & Filters</button>
              <button onClick={() => { setPage('stats'); setUserMenu(false); }}>📈 Analytics & Insights</button>
              <button onClick={() => { setPage('premium'); setUserMenu(false); }}>👑 Go Premium</button>
              <button onClick={install}>📲 Install app</button>
              <button onClick={logout}>↩ Log out</button>
            </div>
          )}
        </div>

        <AppInstallBanner />

        {page === 'home' && (
          <HomePage
            items={items} user={user} settings={settings} aiLive={status?.aiMode === 'live' && prefs.smart_suggestions !== false}
            quickRef={quickRef} defaultView={prefs.default_view}
            onChange={() => { refresh(); refreshNotifs(); }} onToast={showToast} onEdit={goEdit} onOpen={goDetail}
            goCalendarDay={(d) => { setCalendarDay(d); setPage('calendar'); }}
            goCapture={goAdd}
            goOpportunities={() => setPage('opportunities')}
          />
        )}
        {page === 'opportunities' && (
          <OpportunitiesPage items={items} onOpen={goDetail} onEdit={goEdit} goCapture={goAdd} />
        )}
        {page === 'calendar' && (
          <CalendarPage key={calendarDay || 'cal'} items={items} initialDay={calendarDay} onEdit={goEdit} onOpen={goDetail} onToast={showToast} />
        )}
        {page === 'add' && (
          <AddPage
            key={editItem?.id || 'new'}
            item={editItem} initial={sharedDraft} settings={settings} persona={user.persona} prefs={prefs}
            onSaved={({ scheduled } = {}) => {
              const wasEditing = !!editItem;
              setEditItem(null); setSharedDraft(null); refresh(); refreshNotifs(); setPage('home');
              // Never promise reminders for an item that has no date to fire from.
              showToast(wasEditing ? 'Updated ✔' : scheduled ? 'Saved! Reminders are set.' : 'Saved — add a date to get reminders.');
            }}
            onCancel={() => { setEditItem(null); setSharedDraft(null); setPage('home'); }}
            onDelete={deleteFromEdit}
          />
        )}
        {page === 'search' && (
          <SearchPage key={searchSeed} items={items} initialQuery={searchSeed} onChange={refresh} onToast={showToast} onEdit={goEdit} onOpen={goDetail} />
        )}
        {page === 'notifications' && (
          <NotificationsPage notifications={notifications} items={items} onRefreshNotifs={refreshNotifs} onToast={showToast} testNotification={testNotification} />
        )}
        {page === 'stats' && <StatsPage items={items} onOpen={goDetail} />}
        {page === 'settings' && (
          <SettingsPage
            user={user} settings={settings} prefs={prefs}
            onPrefs={(p) => setPrefs(p)}
            onSaved={(s) => { setSettings(s); if (s.prefs) setPrefs({ ...DEFAULT_PREFS, ...s.prefs }); if (s.persona) setUser((u) => ({ ...u, persona: s.persona })); }}
            onToast={showToast} installPrompt={installPrompt} onInstall={install} onLogout={logout}
            onUserUpdate={(u) => setUser(u)} goPremium={() => setPage('premium')}
          />
        )}
        {page === 'premium' && <PremiumPage onToast={showToast} />}
        {page === 'detail' && (
          <DetailPage
            item={detailItem}
            onBack={() => setPage(detailFrom === 'detail' ? 'home' : detailFrom)}
            onEdit={goEdit}
            onChange={() => { refresh(); refreshNotifs(); }}
            onToast={showToast}
          />
        )}
      </div>

      <nav className="bottom-nav">
        {NAV.map((n) => (
          <button key={n.key} className={page === n.key ? 'active' : ''} onClick={() => { if (n.key === 'add') goAdd(); else setPage(n.key); }}>
            <span>{n.icon}</span>{n.short || n.label.split(' ')[0]}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

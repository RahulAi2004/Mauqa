import React from 'react';
import { api, TYPE_MAP, fmtDeadline, fmtTime } from '../api.js';

export default function NotificationsPage({ notifications, items, onRefreshNotifs, onToast, testNotification }) {
  const dismissAll = async () => {
    if (!notifications.length) return;
    await api.ackNotifications(notifications.map((n) => n.id));
    onRefreshNotifs();
    onToast('All caught up ✅');
  };

  const dismissOne = async (n) => {
    await api.ackNotifications([n.id]);
    onRefreshNotifs();
  };

  const snooze = async (n, minutes) => {
    await api.snooze(n.id, minutes);
    onRefreshNotifs();
    onToast(`Snoozed — again ${minutes >= 1440 ? 'tomorrow' : `in ${minutes / 60}h`}.`);
  };

  const scheduled = items
    .flatMap((o) => (o.reminders || []).filter((r) => !r.notified).map((r) => ({ ...r, item: o })))
    .sort((a, b) => a.remind_at.localeCompare(b.remind_at))
    .slice(0, 6);

  return (
    <div className="page">
      <div className="page-grid">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Due now {notifications.length > 0 && <span className="top-count" style={{ width: 24, height: 24, fontSize: '0.72rem' }}>{notifications.length}</span>}</h3>
            {notifications.length > 0 && <button className="linklike" style={{ marginLeft: 'auto', fontSize: '0.82rem' }} onClick={dismissAll}>Mark all as read</button>}
          </div>

          <div className="rows">
            {notifications.length === 0 && (
              <div className="empty">
                <h2>All caught up 🎯</h2>
                <p>No reminders are due right now. When one fires, it shows up here and as a browser notification.</p>
              </div>
            )}
            {notifications.map((n) => (
              <div key={n.id} className="notif-row">
                <div className="notif-ico">{TYPE_MAP[n.item_type]?.emoji || '🔔'}</div>
                <div className="notif-body">
                  <strong>{n.title}</strong>
                  <span>{n.label}{n.deadline ? ` · ${fmtDeadline(n.deadline)}${n.deadline_time ? ` · ${fmtTime(n.deadline_time)}` : ''}` : ''}</span>
                </div>
                {n.apply_link && <a className="btn small ghost" href={n.apply_link} target="_blank" rel="noreferrer">Open →</a>}
                <button className="chip tiny" onClick={() => snooze(n, 60)}>😴 1h</button>
                <button className="chip tiny" onClick={() => snooze(n, 1440)}>😴 Tomorrow</button>
                <button className="icon-btn" title="Dismiss" onClick={() => dismissOne(n)}>✓</button>
              </div>
            ))}
          </div>

          {scheduled.length > 0 && (
            <>
              <h3 style={{ margin: '20px 0 10px' }}>Scheduled next</h3>
              <div className="rows">
                {scheduled.map((r) => (
                  <div key={r.id} className="notif-row" style={{ opacity: 0.85 }}>
                    <div className="notif-ico">{TYPE_MAP[r.item.item_type]?.emoji || '🔔'}</div>
                    <div className="notif-body">
                      <strong>{r.item.title}</strong>
                      <span>{r.label} · fires {r.remind_at.slice(0, 16).replace('T', ' at ')}</span>
                    </div>
                    <span className="due-pill ok">Scheduled</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rail">
          <div className="card">
            <h3>Notification Summary</h3>
            <div className="sum-row"><span>🔔</span> Due now <span className="sum-n">{notifications.length}</span></div>
            <div className="sum-row"><span>⏰</span> Scheduled <span className="sum-n">{items.reduce((a, o) => a + (o.reminders || []).filter((r) => !r.notified).length, 0)}</span></div>
            <div className="sum-row"><span>✅</span> Delivered <span className="sum-n">{items.reduce((a, o) => a + (o.reminders || []).filter((r) => r.notified).length, 0)}</span></div>
          </div>
          <div className="card">
            <h3>Notification Settings</h3>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Browser notifications: <strong style={{ color: typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'var(--good)' : 'var(--warn)' }}>
                {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}
              </strong>
            </p>
            <button className="btn small wide" onClick={testNotification}>🔔 Enable & test notifications</button>
            <p className="muted" style={{ fontSize: '0.74rem', marginTop: 10 }}>
              Tip: use the 📆 button on any item to add it to your phone calendar — those alarms ring even when Mauqa is closed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

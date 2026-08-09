import React, { useMemo, useState } from 'react';
import { daysLeft, TYPES, fmtTime } from '../api.js';
import ItemRow from '../components/ItemRow.jsx';
import MiniCalendar from '../components/MiniCalendar.jsx';
import QuickAdd from '../components/QuickAdd.jsx';
import { attention, deadlineCopy, nextAction, trust } from '../opportunity.js';
import TrustBadge from '../components/TrustBadge.jsx';

const VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done', label: 'Done' },
  { key: 'missed', label: 'Missed' },
];

export default function HomePage({ items, user, settings, aiLive, quickRef, defaultView, onChange, onToast, onEdit, onOpen, goCalendarDay, goCapture, goOpportunities }) {
  const [view, setView] = useState(defaultView || 'upcoming');
  const [typeFilter, setTypeFilter] = useState('all');

  const inView = (o, v) => {
    const dl = daysLeft(o.deadline);
    const expired = dl !== null && dl < 0;
    const pending = o.status === 'pending';
    switch (v) {
      case 'today': return pending && dl === 0;
      case 'week': return pending && dl !== null && dl >= 0 && dl <= 7;
      case 'upcoming': return pending && (dl === null || dl >= 0);
      case 'done': return o.status === 'done';
      case 'missed': return (pending && expired) || o.status === 'missed';
      default: return true;
    }
  };

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, items.filter((o) => inView(o, v.key)).length])), [items]);

  const filtered = items.filter((o) => inView(o, view) && (typeFilter === 'all' || o.item_type === typeFilter));
  const typesPresent = TYPES.filter((t) => items.some((i) => i.item_type === t.key));

  const todayItems = items.filter((o) => o.status === 'pending' && daysLeft(o.deadline) === 0);
  // UTC on both sides on purpose: updated_at is written as SQLite datetime('now'),
  // which is UTC. Switching this to a local date would mis-bucket "Done today".
  const todayIso = new Date().toISOString().slice(0, 10);
  const doneToday = items.filter((o) => o.status === 'done' && (o.updated_at || '').slice(0, 10) === todayIso).length;
  const dueSoon = todayItems.filter((o) => o.deadline_time).slice(0, 3);
  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  // Opportunities that actually need a move now — see attention() in opportunity.js.
  const needsAttention = useMemo(() => attention(items, 3), [items]);

  return (
    <div className="page">
      <QuickAdd settings={settings} aiLive={aiLive} inputRef={quickRef} onSaved={() => { onChange(); onToast('Added! ⚡'); }} />

      <div className="page-grid">
        <div>
          {needsAttention.length > 0 && (
            <section className="closing-soon">
              <div className="closing-head">
                <h3>Needs your attention</h3>
                {goOpportunities && <button className="linklike" onClick={goOpportunities}>All opportunities →</button>}
              </div>
              <div className="rows">
                {needsAttention.map((o) => {
                  const act = nextAction(o);
                  const due = deadlineCopy(o);
                  const t = trust(o);
                  const showTrust = t.level === 'needs_review' || t.level === 'unverified';
                  return (
                    <div key={o.id} className="attn-row" onClick={() => onOpen?.(o)}>
                      <div className="attn-body">
                        <p className="attn-action">{act.text}</p>
                        <div className="attn-meta">
                          <span className="attn-title">{o.title}</span>
                          <span className="attn-dot">·</span>
                          <span className={`attn-due ${due.tone}`}>{showTrust ? t.label : due.text}</span>
                        </div>
                      </div>
                      {showTrust && <TrustBadge state={t} />}
                      <button className="btn primary small"
                        onClick={(e) => { e.stopPropagation(); act.kind === 'edit' ? onEdit?.(o) : onOpen?.(o); }}>
                        {act.cta}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {VIEWS.map((v) => (
              <button key={v.key} className={`chip ${view === v.key ? 'chip-active' : ''}`} onClick={() => setView(v.key)}>
                {v.label} <strong>{counts[v.key]}</strong>
              </button>
            ))}
          </div>
          {typesPresent.length > 1 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
              <button className={`chip tiny ${typeFilter === 'all' ? 'chip-active' : ''}`} onClick={() => setTypeFilter('all')}>All types</button>
              {typesPresent.map((t) => (
                <button key={t.key} className={`chip tiny ${typeFilter === t.key ? 'chip-active' : ''}`} onClick={() => setTypeFilter(t.key)}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="rows">
            {filtered.length === 0 && (
              <div className="empty">
                {items.length === 0 ? (
                  <>
                    <h2>Salaam {user.name.split(' ')[0]} 👋</h2>
                    <p>
                      Found a <strong>scholarship, internship, hackathon</strong> or <strong>job</strong> worth applying to?
                      Send it to <strong>Capture</strong> — paste the link, drop a screenshot or share the post — and Mauqa
                      pulls out the deadline, eligibility and required documents, then reminds you before it closes.
                    </p>
                    {goCapture && (
                      <button className="btn primary" style={{ marginTop: 4 }} onClick={goCapture}>
                        🎯 Capture your first opportunity
                      </button>
                    )}
                    <p className="muted" style={{ marginTop: 14, fontSize: '0.84rem' }}>
                      Everything else you need to act on lives here too — type it in the <strong>⚡ bar above</strong>:
                      <em>"submit scholarship docs friday"</em>, <em>"meeting with Ali kal 3pm"</em>, <em>"bijli ka bill 5 aug"</em>.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>You're clear for now ✨</h2>
                    <p className="muted">Capture an opportunity or plan your day in the ⚡ bar above.</p>
                  </>
                )}
              </div>
            )}
            {filtered.map((o) => (
              <ItemRow key={o.id} item={o} onChange={onChange} onToast={onToast} onEdit={onEdit} onOpen={onOpen} />
            ))}
          </div>
          {filtered.length > 0 && <p className="muted" style={{ textAlign: 'center', fontSize: '0.78rem' }}>Showing {filtered.length} reminder{filtered.length > 1 ? 's' : ''}</p>}
        </div>

        <div className="rail">
          <div className="card">
            <h3>Today's Summary ✨</h3>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>{todayStr}</p>
            <div style={{ display: 'flex', gap: 10, textAlign: 'center' }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{todayItems.length}</div><div className="muted" style={{ fontSize: '0.72rem' }}>Due today</div></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warn)' }}>{counts.week}</div><div className="muted" style={{ fontSize: '0.72rem' }}>This week</div></div>
              <div style={{ flex: 1 }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--good)' }}>{doneToday}</div><div className="muted" style={{ fontSize: '0.72rem' }}>Done today</div></div>
            </div>
            {dueSoon.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {dueSoon.map((o) => (
                  <div key={o.id} className="agenda-row">
                    <span className="agenda-time">{fmtTime(o.deadline_time)}</span>
                    <span style={{ fontWeight: 600 }}>{o.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Calendar</h3>
            <MiniCalendar items={items} onPick={goCalendarDay} />
          </div>
        </div>
      </div>
    </div>
  );
}

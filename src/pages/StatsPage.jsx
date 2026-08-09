import React, { useMemo } from 'react';
import { TYPES, typeColor, daysLeft } from '../api.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Status colors (done/pending/overdue and created/completed/overdue) are reserved
// semantics — categorical type colors are never reused for them.
export default function StatsPage({ items, onOpen }) {
  const todayIso = isoDay(new Date());

  const total = items.length;
  const done = items.filter((o) => o.status === 'done').length;
  const overdueN = items.filter((o) => o.status === 'pending' && daysLeft(o.deadline) !== null && daysLeft(o.deadline) < 0).length;
  const pending = items.filter((o) => o.status === 'pending').length - overdueN;
  const rate = total ? Math.round((done / total) * 100) : 0;

  // ---- line chart: created vs completed per day, last 7 days ----
  const days7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const iso = isoDay(d);
    return {
      iso,
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      created: items.filter((o) => (o.created_at || '').slice(0, 10) === iso).length,
      completed: items.filter((o) => o.status === 'done' && (o.updated_at || '').slice(0, 10) === iso).length,
    };
  }), [items]);
  const lineMax = Math.max(1, ...days7.flatMap((d) => [d.created, d.completed]));
  const W = 560, H = 150, PADX = 30, PADY = 14;
  const x = (i) => PADX + (i * (W - 2 * PADX)) / 6;
  const y = (v) => H - PADY - (v / lineMax) * (H - 2 * PADY);
  const pathOf = (key) => days7.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d[key])}`).join(' ');

  // ---- upcoming load: next 7 days ----
  const load = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    const iso = isoDay(d);
    return {
      label: i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' }),
      sub: d.getDate(),
      n: items.filter((o) => o.status === 'pending' && o.deadline === iso).length,
    };
  }), [items]);
  const loadMax = Math.max(1, ...load.map((l) => l.n));
  const busiest = load.reduce((a, b) => (b.n > a.n ? b : a), load[0]);

  // ---- category share ----
  const share = useMemo(() => {
    const counts = TYPES.map((t) => ({ ...t, n: items.filter((o) => o.item_type === t.key).length })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n);
    const top = counts.slice(0, 5);
    const rest = counts.slice(5).reduce((a, s) => a + s.n, 0);
    if (rest > 0) top.push({ key: 'other', label: 'Other', emoji: '📌', n: rest });
    return top;
  }, [items]);
  const shareTotal = share.reduce((a, s) => a + s.n, 0) || 1;
  const R = 50, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = share.map((s) => {
    const frac = s.n / shareTotal;
    const seg = { ...s, dash: Math.max(0, frac * C - 3), offset: -acc * C };
    acc += frac;
    return seg;
  });

  // ---- streak ----
  const streak = useMemo(() => {
    const doneDays = new Set(items.filter((o) => o.status === 'done').map((o) => (o.updated_at || '').slice(0, 10)));
    let s = 0;
    const d = new Date();
    while (doneDays.has(isoDay(d))) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }, [items]);

  // ---- smart insights (rule-based, honest) ----
  const insights = [];
  const doneThisWeek = days7.reduce((a, d) => a + d.completed, 0);
  if (doneThisWeek > 0) insights.push({ ico: '✅', bg: 'var(--good-soft)', title: 'Great job!', body: `You completed ${doneThisWeek} reminder${doneThisWeek > 1 ? 's' : ''} in the last 7 days.` });
  if (busiest.n >= 2) insights.push({ ico: '🕐', bg: 'var(--warn-soft)', title: `High load ${busiest.label === 'Today' ? 'today' : `on ${busiest.label}`}`, body: `You have ${busiest.n} reminders ${busiest.label === 'Today' ? 'today' : `on ${busiest.label} ${busiest.sub}`}. Plan ahead to stay on track.` });
  if (overdueN > 0) insights.push({ ico: '⚠️', bg: 'var(--bad-soft)', title: `${overdueN} reminder${overdueN > 1 ? 's are' : ' is'} overdue`, body: 'Review and take action — or mark them done/missed.' });
  if (streak >= 2) insights.push({ ico: '🔥', bg: 'var(--primary-soft)', title: `${streak}-day streak`, body: 'You completed something every day — keep it up!' });
  if (insights.length === 0) insights.push({ ico: '✨', bg: 'var(--primary-soft)', title: 'All clear', body: 'Add reminders and complete them to see insights here.' });

  // ---- recent activity ----
  const activity = useMemo(() => {
    const evts = [];
    for (const o of items) {
      if (o.created_at) evts.push({ when: o.created_at, ico: '➕', text: `Added: ${o.title}`, item: o });
      if (o.status === 'done' && o.updated_at) evts.push({ when: o.updated_at, ico: '✅', text: `Completed: ${o.title}`, item: o });
    }
    return evts.sort((a, b) => b.when.localeCompare(a.when)).slice(0, 6);
  }, [items]);

  return (
    <div className="page">
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="tile"><span className="t-ico">📋</span><div className="t-num">{total}</div><div className="t-label">Total Reminders</div></div>
        <div className="tile"><span className="t-ico">✅</span><div className="t-num" style={{ color: 'var(--good)' }}>{done}</div><div className="t-label">Completed</div></div>
        <div className="tile"><span className="t-ico">⏳</span><div className="t-num" style={{ color: 'var(--warn)' }}>{pending}</div><div className="t-label">Pending</div></div>
        <div className="tile"><span className="t-ico">🚩</span><div className="t-num" style={{ color: 'var(--bad)' }}>{overdueN}</div><div className="t-label">Overdue</div></div>
        <div className="tile"><span className="t-ico">🎯</span><div className="t-num" style={{ color: 'var(--primary)' }}>{rate}%</div><div className="t-label">Completion Rate</div></div>
      </div>

      <div className="page-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3>Reminders Overview <span className="muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}>· last 7 days</span></h3>
            <div className="chart-legend">
              <span><span className="sw" style={{ background: 'var(--primary)' }} />Created</span>
              <span><span className="sw" style={{ background: 'var(--good)' }} />Completed</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Created vs completed reminders per day">
                {[0, Math.ceil(lineMax / 2), lineMax].map((v) => (
                  <g key={v}>
                    <line x1={PADX} x2={W - PADX} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
                    <text x={PADX - 7} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{v}</text>
                  </g>
                ))}
                <path d={pathOf('created')} fill="none" stroke="var(--primary)" strokeWidth="2" />
                <path d={pathOf('completed')} fill="none" stroke="var(--good)" strokeWidth="2" />
                {days7.map((d, i) => (
                  <g key={i}>
                    <circle cx={x(i)} cy={y(d.created)} r="4" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2"><title>{`${d.label}: ${d.created} created`}</title></circle>
                    <circle cx={x(i)} cy={y(d.completed)} r="4" fill="var(--good)" stroke="var(--surface)" strokeWidth="2"><title>{`${d.label}: ${d.completed} completed`}</title></circle>
                    <text x={x(i)} y={H + 12} textAnchor="middle" fontSize="9" fill="var(--muted)">{d.label}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="row2" style={{ gap: 16 }}>
            <div className="card">
              <h3>Reminders by Type</h3>
              {share.length === 0 ? <p className="muted">No data yet.</p> : (
                <div className="donut-wrap" style={{ flexDirection: 'column' }}>
                  <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Reminders by type">
                    {arcs.map((a) => (
                      <circle key={a.key} cx="65" cy="65" r={R} fill="none"
                        stroke={a.key === 'other' ? 'var(--cat-other)' : typeColor(a.key)}
                        strokeWidth="16" strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={a.offset}
                        transform="rotate(-90 65 65)">
                        <title>{`${a.label}: ${a.n} (${Math.round((a.n / shareTotal) * 100)}%)`}</title>
                      </circle>
                    ))}
                    <text x="65" y="62" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text)">{shareTotal}</text>
                    <text x="65" y="78" textAnchor="middle" fontSize="9" fill="var(--muted)">total</text>
                  </svg>
                  <div className="donut-legend" style={{ width: '100%' }}>
                    {arcs.map((a) => (
                      <div key={a.key} className="dl-row">
                        <span className="sw" style={{ background: a.key === 'other' ? 'var(--cat-other)' : typeColor(a.key) }} />
                        {a.emoji} {a.label}
                        <span className="dl-val">{a.n} ({Math.round((a.n / shareTotal) * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h3>Upcoming Load</h3>
              {busiest.n > 0 && (
                <p style={{ margin: '0 0 4px', fontSize: '0.83rem' }} className="muted">
                  Your busiest day is <strong style={{ color: 'var(--primary)' }}>{busiest.label === 'Today' ? 'today' : busiest.label}</strong> — {busiest.n} reminder{busiest.n > 1 ? 's' : ''} scheduled.
                </p>
              )}
              <div className="bars" style={{ height: 130 }}>
                {load.map((l, i) => (
                  <div key={i} className="bar-col" title={`${l.label} ${l.sub}: ${l.n} reminder(s)`}>
                    {l.n > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700 }}>{l.n}</span>}
                    <div className="bar-stack" style={{ height: `${(l.n / loadMax) * 100}%`, minHeight: l.n ? 8 : 3 }}>
                      <div className="bar-seg top" style={{ flex: 1, background: l === busiest && l.n > 0 ? 'var(--primary)' : 'var(--primary-soft)' }} />
                    </div>
                    <span className="bar-x">{l.label}<br /><span style={{ opacity: 0.7 }}>{l.sub}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rail">
          <div className="card">
            <h3>✨ Smart Insights</h3>
            {insights.map((ins, i) => (
              <div key={i} className="insight">
                <span className="in-ico" style={{ background: ins.bg }}>{ins.ico}</span>
                <div><strong style={{ fontSize: '0.85rem' }}>{ins.title}</strong><div className="muted" style={{ fontSize: '0.78rem' }}>{ins.body}</div></div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Top Categories</h3>
            {share.map((s) => (
              <div key={s.key} className="hbar-row">
                <span className="hb-label">{s.emoji} {s.label}</span>
                <div className="hb-track"><div className="hb-fill" style={{ width: `${(s.n / shareTotal) * 100}%`, background: s.key === 'other' ? 'var(--cat-other)' : typeColor(s.key) }} /></div>
                <span className="hb-val">{Math.round((s.n / shareTotal) * 100)}%</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>🔥 Streak</h3>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{streak} day{streak !== 1 ? 's' : ''}</div>
              <p className="muted" style={{ fontSize: '0.78rem' }}>{streak > 0 ? 'Keep it up! 🎉' : 'Complete a reminder today to start.'}</p>
            </div>
          </div>

          <div className="card">
            <h3>Recent Activity</h3>
            {activity.length === 0 && <p className="muted" style={{ fontSize: '0.8rem' }}>No activity yet.</p>}
            {activity.map((a, i) => (
              <div key={i} className="activity-row" style={{ cursor: 'pointer' }} onClick={() => onOpen(a.item)}>
                <span>{a.ico}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</span>
                <span className="act-when">{a.when.slice(5, 16).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="muted" style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: 14 }}>ℹ️ Analytics are based on your reminders and activity. Data is private and only visible to you.</p>
    </div>
  );
}

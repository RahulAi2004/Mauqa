import React, { useMemo, useState } from 'react';
import { TYPE_MAP, TYPES, typeColor, fmtTime, fmtDeadline, daysLeft, uiPrefs } from '../api.js';
import MiniCalendar from '../components/MiniCalendar.jsx';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function CalendarPage({ items, initialDay, onEdit, onOpen, onToast }) {
  const today = new Date();
  const start = initialDay ? new Date(`${initialDay}T00:00:00`) : today;
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [selected, setSelected] = useState(initialDay || isoOf(today.getFullYear(), today.getMonth(), today.getDate()));

  const byDay = useMemo(() => {
    const map = {};
    for (const o of items) if (o.deadline) (map[o.deadline] ||= []).push(o);
    for (const list of Object.values(map)) list.sort((a, b) => (a.deadline_time || '99').localeCompare(b.deadline_time || '99'));
    return map;
  }, [items]);

  const ws = uiPrefs.week_start || 0;
  const first = new Date(view.y, view.m, 1);
  const startDow = (first.getDay() - ws + 7) % 7;
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const prevDays = new Date(view.y, view.m, 0).getDate();
  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ d: prevDays - i, other: true, iso: null });
  for (let d = 1; d <= daysIn; d++) cells.push({ d, other: false, iso: isoOf(view.y, view.m, d) });
  while (cells.length % 7) cells.push({ d: cells.length % 7, other: true, iso: null });

  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
  const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const agenda = byDay[selected] || [];
  const upcoming = items
    .filter((o) => o.status === 'pending' && o.deadline && daysLeft(o.deadline) >= 0)
    .slice(0, 5);

  const move = (dir) => setView((v) => {
    const m = v.m + dir;
    return m < 0 ? { y: v.y - 1, m: 11 } : m > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m };
  });

  return (
    <div className="page">
      <div className="page-grid">
        <div>
          <div className="cal-head">
            <button className="btn small" onClick={() => { setView({ y: today.getFullYear(), m: today.getMonth() }); setSelected(todayIso); }}>Today</button>
            <button className="icon-btn" onClick={() => move(-1)}>‹</button>
            <button className="icon-btn" onClick={() => move(1)}>›</button>
            <span className="cal-title">{monthName}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.78rem' }}>Click a day to see its agenda</span>
          </div>

          <div className="cal-grid">
            {Array.from({ length: 7 }, (_, i) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(i + ws) % 7]).map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {cells.map((c, i) => (
              <div
                key={i}
                className={`cal-cell ${c.other ? 'other-month' : ''} ${c.iso === todayIso ? 'today' : ''} ${c.iso === selected ? 'selected' : ''}`}
                onClick={() => c.iso && setSelected(c.iso)}
              >
                <span className="cal-daynum">{c.d}</span>
                {c.iso && (byDay[c.iso] || []).slice(0, 3).map((o) => (
                  <span key={o.id} className="cal-evt" style={{ '--tp': typeColor(o.item_type) }} title={o.title}>
                    {o.deadline_time ? `${fmtTime(o.deadline_time)} ` : ''}{o.title}
                  </span>
                ))}
                {c.iso && (byDay[c.iso] || []).length > 3 && <span className="cal-more">+{byDay[c.iso].length - 3} more</span>}
              </div>
            ))}
          </div>

          <div className="chart-legend" style={{ marginTop: 12 }}>
            {TYPES.filter((t) => items.some((i) => i.item_type === t.key)).map((t) => (
              <span key={t.key}><span className="sw" style={{ background: typeColor(t.key) }} />{t.label}</span>
            ))}
          </div>
        </div>

        <div className="rail">
          <div className="card">
            <h3>Mini Calendar</h3>
            <MiniCalendar items={items} selected={selected} onPick={(d) => { setSelected(d); const dt = new Date(`${d}T00:00:00`); setView({ y: dt.getFullYear(), m: dt.getMonth() }); }} />
          </div>
          <div className="card">
            <h3>Agenda</h3>
            <p className="muted" style={{ margin: '0 0 6px', fontSize: '0.8rem', color: 'var(--primary)' }}>{fmtDeadline(selected)}</p>
            {agenda.length === 0 && <p className="muted" style={{ fontSize: '0.83rem' }}>Nothing scheduled this day.</p>}
            {agenda.map((o) => (
              <div key={o.id} className="agenda-row" style={{ cursor: 'pointer' }} onClick={() => (onOpen || onEdit)(o)}>
                <span className="agenda-time">{o.deadline_time ? fmtTime(o.deadline_time) : 'All day'}</span>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>{TYPE_MAP[o.item_type]?.emoji} {o.title}</strong>
                  {o.location && <div className="muted" style={{ fontSize: '0.74rem' }}>{o.location}</div>}
                </div>
                <span className="sw" style={{ background: typeColor(o.item_type), marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Upcoming Reminders</h3>
            {upcoming.length === 0 && <p className="muted" style={{ fontSize: '0.83rem' }}>Nothing upcoming.</p>}
            {upcoming.map((o) => (
              <div key={o.id} className="agenda-row" style={{ cursor: 'pointer' }} onClick={() => (onOpen || onEdit)(o)}>
                <span className="agenda-time">{o.deadline.slice(5)}{o.deadline_time ? ` ${fmtTime(o.deadline_time)}` : ''}</span>
                <span style={{ fontWeight: 600, fontSize: '0.83rem' }}>{o.title}</span>
                <span className="type-pill" style={{ '--tp': typeColor(o.item_type), marginLeft: 'auto' }}>{TYPE_MAP[o.item_type]?.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

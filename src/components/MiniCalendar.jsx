import React, { useState } from 'react';
import { uiPrefs } from '../api.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function MiniCalendar({ items = [], selected, onPick }) {
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const dotDays = new Set(items.filter((i) => i.deadline && i.status === 'pending').map((i) => i.deadline));

  const ws = uiPrefs.week_start || 0;
  const first = new Date(view.y, view.m, 1);
  const startDow = (first.getDay() - ws + 7) % 7;
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button className="icon-btn" style={{ padding: '3px 9px' }} onClick={() => setView((v) => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })}>‹</button>
        <strong style={{ fontSize: '0.85rem' }}>{monthName}</strong>
        <button className="icon-btn" style={{ padding: '3px 9px' }} onClick={() => setView((v) => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 })}>›</button>
      </div>
      <table className="mini-cal">
        <thead><tr>{Array.from({ length: 7 }, (_, i) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][(i + ws) % 7]).map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <tr key={w}>
              {cells.slice(w * 7, w * 7 + 7).map((d, i) => (
                <td key={i}>
                  {d && (
                    <button
                      className={`${iso(view.y, view.m, d) === todayIso ? 'today' : ''} ${dotDays.has(iso(view.y, view.m, d)) ? 'has-dot' : ''} ${selected === iso(view.y, view.m, d) ? 'sel' : ''}`}
                      style={selected === iso(view.y, view.m, d) && iso(view.y, view.m, d) !== todayIso ? { outline: '1.5px solid var(--primary)' } : undefined}
                      onClick={() => onPick?.(iso(view.y, view.m, d))}
                    >{d}</button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

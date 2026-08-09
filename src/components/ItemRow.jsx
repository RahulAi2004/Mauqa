import React from 'react';
import { api, daysLeft, fmtDeadline, fmtTime, TYPE_MAP, typeColor } from '../api.js';

export default function ItemRow({ item, onChange, onToast, onEdit, onOpen }) {
  const dl = daysLeft(item.deadline);
  const expired = dl !== null && dl < 0;
  const type = TYPE_MAP[item.item_type] || TYPE_MAP.other;
  const done = item.status === 'done';
  const color = typeColor(item.item_type);

  const dueClass = done ? 'donep' : dl === null ? 'none' : expired ? 'urgent' : dl === 0 ? 'urgent' : dl <= 3 ? 'soon' : 'ok';
  const dueText = done ? 'done ✓'
    : dl === null ? 'no date'
    : expired ? (item.status === 'missed' ? 'missed' : `${-dl}d overdue`)
    : dl === 0 ? (item.deadline_time ? `Today ${fmtTime(item.deadline_time)}` : 'Due today')
    : dl === 1 ? 'Tomorrow'
    : `In ${dl} days`;

  const toggleDone = async () => {
    await api.update(item.id, { status: done ? 'pending' : 'done' });
    onChange();
    if (!done) onToast('Done! 🎉');
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await api.remove(item.id);
    onChange();
  };

  const pendingRem = (item.reminders || []).filter((r) => !r.notified).length;

  return (
    <div className={`item-row ${done ? 'is-done' : ''}`} style={{ flexWrap: 'wrap' }}>
      <input type="checkbox" className="ir-check" checked={done} onChange={toggleDone} title={done ? 'Mark pending' : 'Mark done'} />
      <div className="ir-tile" style={{ '--tile': color }}>{type.emoji}</div>
      <div className="ir-body">
        <p className="ir-title" title="Open details" onClick={() => onOpen?.(item)}>{item.title}</p>
        <div className="ir-meta">
          <span>{fmtDeadline(item.deadline)}{item.deadline_time ? ` · ${fmtTime(item.deadline_time)}` : ''}</span>
          {item.organization && <span>· {item.organization}</span>}
          {item.location && <span>· 📍 {item.location}</span>}
          {item.recurrence !== 'none' && <span>· 🔁 {item.recurrence}</span>}
          {(item.extraction_mode === 'ai' || item.extraction_mode === 'mock') && (
            <span className="est" title="Auto-extracted — verify before acting">{item.extraction_mode === 'ai' ? 'AI' : 'auto'}</span>
          )}
        </div>
      </div>
      <span className="type-pill" style={{ '--tp': color }}>{type.label}</span>
      <span className={`due-pill ${dueClass}`}>{dueText}</span>
      {pendingRem > 0 && <span className="ir-rem">🔔 {pendingRem}</span>}
      <div className="ir-actions">
        {item.apply_link && <a className="icon-btn" href={item.apply_link} target="_blank" rel="noreferrer" title="Open link">↗</a>}
        {item.deadline && <a className="icon-btn" href={`/api/opportunities/${item.id}/ics`} title="Add to phone calendar (.ics with alarms)">📆</a>}
        <button className="icon-btn" onClick={() => onEdit(item)} title="Edit">✏️</button>
        <button className="icon-btn" onClick={remove} title="Delete">🗑</button>
      </div>
    </div>
  );
}

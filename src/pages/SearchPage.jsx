import React, { useMemo, useState } from 'react';
import { TYPES, daysLeft } from '../api.js';
import ItemRow from '../components/ItemRow.jsx';

export default function SearchPage({ items, initialQuery, initialType, onChange, onToast, onEdit, onOpen }) {
  const [q, setQ] = useState(initialQuery || '');
  const [type, setType] = useState(initialType || 'all');
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState('all');
  const [prios, setPrios] = useState([]);

  const togglePrio = (p) => setPrios((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((o) => {
      if (query) {
        const hay = [o.title, o.organization, o.item_type, o.category, o.summary, o.location, (o.tags || []).join(' ')].join(' ').toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (type !== 'all' && o.item_type !== type) return false;
      if (status === 'pending' && o.status !== 'pending') return false;
      if (status === 'done' && o.status !== 'done') return false;
      if (prios.length && !prios.includes(o.priority)) return false;
      if (range !== 'all') {
        const dl = daysLeft(o.deadline);
        if (dl === null) return false;
        if (range === '7' && (dl < 0 || dl > 7)) return false;
        if (range === '30' && (dl < 0 || dl > 30)) return false;
        if (range === 'past' && dl >= 0) return false;
      }
      return true;
    });
  }, [items, q, type, status, range, prios]);

  const typeCounts = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = items.filter((o) => !query || [o.title, o.organization, o.item_type, o.category, o.summary, o.location, (o.tags || []).join(' ')].join(' ').toLowerCase().includes(query));
    const c = { all: base.length };
    for (const t of TYPES) c[t.key] = base.filter((o) => o.item_type === t.key).length;
    return c;
  }, [items, q]);

  const clearAll = () => { setType('all'); setStatus('all'); setRange('all'); setPrios([]); };

  return (
    <div className="page">
      <div className="page-grid">
        <div>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Search opportunities & tasks, e.g. "scholarship"…'
            style={{ fontSize: '1rem', padding: '13px 16px', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
            <button className={`chip ${type === 'all' ? 'chip-active' : ''}`} onClick={() => setType('all')}>All ({typeCounts.all})</button>
            {TYPES.filter((t) => typeCounts[t.key] > 0 || t.key === type).map((t) => (
              <button key={t.key} className={`chip ${type === t.key ? 'chip-active' : ''}`} onClick={() => setType(t.key)}>
                {t.emoji} {t.label} ({typeCounts[t.key]})
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 10px' }}>{results.length} result{results.length !== 1 ? 's' : ''} found</p>
          <div className="rows">
            {results.map((o) => <ItemRow key={o.id} item={o} onChange={onChange} onToast={onToast} onEdit={onEdit} onOpen={onOpen} />)}
            {results.length === 0 && (
              <div className="empty">
                {type === 'opportunity' && !q.trim() ? (
                  <>
                    <h2>No opportunities yet 🎯</h2>
                    <p>
                      Scholarships, internships, hackathons, fellowships, competitions, admissions — anything you find
                      and want to act on lands here, with its deadline, eligibility and required documents pulled out.
                    </p>
                    <p className="muted">Send one to <strong>Capture</strong>: paste the link, drop a screenshot, or share the post from your phone.</p>
                  </>
                ) : (
                  <p className="muted">No matches. Try different words or clear the filters.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rail">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Filters</h3>
              <button className="linklike" style={{ fontSize: '0.78rem' }} onClick={clearAll}>Clear all</button>
            </div>
            <label>Date range</label>
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="all">All time</option>
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="past">Past / overdue</option>
            </select>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
            <label>Priority</label>
            {[['high', '🔴 High'], ['normal', '🟠 Medium'], ['low', '🟢 Low']].map(([v, l]) => (
              <label key={v} className="check" style={{ margin: '5px 0' }}>
                <input type="checkbox" checked={prios.includes(v)} onChange={() => togglePrio(v)} /> {l}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { daysLeft } from '../api.js';
import OpportunityCard from '../components/OpportunityCard.jsx';
import { STAGES, byRisk, documents, isOpportunity, stage, trust } from '../opportunity.js';
import TrustBadge from '../components/TrustBadge.jsx';

export default function OpportunitiesPage({ items, onOpen, onEdit, goCapture }) {
  const [stageKey, setStageKey] = useState('all');
  const [q, setQ] = useState('');

  const opps = useMemo(() => items.filter(isOpportunity), [items]);

  const counts = useMemo(() => {
    const c = { all: opps.length };
    for (const s of STAGES) if (s.key !== 'all') c[s.key] = 0;
    for (const o of opps) c[stage(o)] = (c[stage(o)] || 0) + 1;
    return c;
  }, [opps]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return opps
      .filter((o) => (stageKey === 'all' ? true : stage(o) === stageKey))
      .filter((o) => !query || [o.title, o.organization, o.category, (o.tags || []).join(' ')]
        .join(' ').toLowerCase().includes(query))
      .sort(byRisk);
  }, [opps, stageKey, q]);

  // Header value line — proof that Mauqa is doing something for you.
  const closingThisMonth = opps.filter((o) => {
    const dl = daysLeft(o.deadline);
    return o.status === 'pending' && dl !== null && dl >= 0 && dl <= 30;
  }).length;
  const needDocs = opps.filter((o) => o.status === 'pending' && !documents(o).complete).length;

  const attention = opps
    .filter((o) => o.status === 'pending' && ['needs_review', 'unverified'].includes(trust(o).level))
    .sort(byRisk)
    .slice(0, 4);

  return (
    <div className="page">
      <div className="opp-head">
        <div>
          <h2>Opportunities</h2>
          <div className="opp-value">
            <strong>{opps.length}</strong> tracked · <strong>{closingThisMonth}</strong> closing within 30 days ·{' '}
            <strong>{needDocs}</strong> need documents
          </div>
        </div>
        <button className="btn primary small" style={{ marginLeft: 'auto' }} onClick={goCapture}>+ Capture</button>
      </div>

      <div className="page-grid">
        <div>
          {opps.length > 0 && (
            <>
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder='Filter by name, organisation or tag…'
                style={{ marginBottom: 10 }}
              />
              <div className="opp-stages">
                {STAGES.filter((s) => s.key === 'all' || counts[s.key] > 0 || s.key === stageKey).map((s) => (
                  <button key={s.key} className={`chip ${stageKey === s.key ? 'chip-active' : ''}`} onClick={() => setStageKey(s.key)}>
                    {s.label} <strong>{counts[s.key] || 0}</strong>
                  </button>
                ))}
              </div>
            </>
          )}

          {list.length === 0 ? (
            <div className="empty">
              {opps.length === 0 ? (
                <>
                  <h2>No opportunities tracked yet 🎯</h2>
                  <p>
                    Next time you see a <strong>scholarship, internship or hackathon</strong>, add it to Mauqa.
                    It pulls out the deadline, eligibility and required documents, then keeps you on track until you apply.
                  </p>
                  <button className="btn primary" onClick={goCapture}>🎯 Capture your first opportunity</button>
                  <p className="muted" style={{ marginTop: 12, fontSize: '0.83rem' }}>
                    Paste the link, drop a screenshot, or share the post straight from your phone.
                  </p>
                </>
              ) : (
                <p className="muted">Nothing in this stage. Try another filter.</p>
              )}
            </div>
          ) : (
            <div className="opp-grid">
              {list.map((o) => <OpportunityCard key={o.id} item={o} onOpen={onOpen} onEdit={onEdit} />)}
            </div>
          )}
        </div>

        <div className="rail">
          <div className="card">
            <h3>Needs your attention</h3>
            {attention.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                {opps.length ? 'Nothing is waiting on a review right now. 🎉' : 'Nothing tracked yet.'}
              </p>
            ) : attention.map((o) => (
              <div key={o.id} className="agenda-row" style={{ cursor: 'pointer' }} onClick={() => onOpen?.(o)}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: '0.83rem', display: 'block' }}>{o.title}</strong>
                  <span className="muted" style={{ fontSize: '0.74rem' }}>{trust(o).reasons?.[0] || trust(o).label}</span>
                </div>
                <TrustBadge state={trust(o)} />
              </div>
            ))}
          </div>

          <div className="card" style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
            💡 <strong>How ranking works:</strong> opportunities are ordered by how soon they close
            <em> and </em> how ready you are. Something closing in 2 days with no documents ready sits above
            something closing in 2 days that is good to go.
          </div>
        </div>
      </div>
    </div>
  );
}

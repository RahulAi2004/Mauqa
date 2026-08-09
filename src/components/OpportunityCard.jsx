import React from 'react';
import { fmtDeadline, typeColor } from '../api.js';
import { categoryMeta, deadlineCopy, documents, nextAction, trust } from '../opportunity.js';
import TrustBadge from './TrustBadge.jsx';

// Readable in under 3 seconds. Strict hierarchy:
//   title → organization → trust → countdown → documents → next action → CTA
// Everything else (tags, summary, location, source, reminders) lives on Detail.
export default function OpportunityCard({ item, compact = false, onOpen, onEdit }) {
  const cat = categoryMeta(item.category);
  const t = trust(item);
  const docs = documents(item);
  const act = nextAction(item);
  const due = deadlineCopy(item);
  const pct = docs.total ? Math.round((docs.done / docs.total) * 100) : 100;

  const runCta = () => {
    if (act.kind === 'apply' && item.apply_link) window.open(item.apply_link, '_blank', 'noopener,noreferrer');
    else if (act.kind === 'edit') onEdit?.(item);
    else onOpen?.(item);
  };

  if (compact) {
    return (
      <div className="card opp-card compact">
        <div className="ir-tile" style={{ '--tile': typeColor('opportunity') }}>{cat.emoji}</div>
        <div className="oc-heads">
          <p className="oc-title" title="Open details" onClick={() => onOpen?.(item)}>{item.title}</p>
          <div className="oc-org">
            {item.organization || cat.label}
            {docs.total > 0 && <> · {docs.done}/{docs.total} documents</>}
          </div>
        </div>
        <span className={`due-pill ${due.tone}`}>{due.text}</span>
        <TrustBadge state={t} />
        <div className="oc-next">
          <div className="oc-next-label">Next</div>
          <div className="oc-next-text">{act.text}</div>
        </div>
        <div className="oc-foot">
          <button className="btn primary small" onClick={runCta}>{act.cta}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card opp-card">
      <div className="oc-top">
        <div className="ir-tile" style={{ '--tile': typeColor('opportunity') }}>{cat.emoji}</div>
        <div className="oc-heads">
          <div className="oc-meta">
            <span className="type-pill" style={{ '--tp': typeColor('opportunity') }}>{cat.label}</span>
            <TrustBadge state={t} />
          </div>
          <p className="oc-title" title="Open details" onClick={() => onOpen?.(item)}>{item.title}</p>
          <div className="oc-org">{item.organization || '—'}</div>
        </div>
      </div>

      <div className="oc-sep" />

      <div className="oc-due">
        <span className={`due-pill ${due.tone}`}>{due.text}</span>
        {item.deadline && <span className="oc-due-date">{fmtDeadline(item.deadline)}</span>}
      </div>

      {docs.total > 0 && (
        <div>
          <div className="oc-block">
            <span>Documents</span>
            <span className="oc-docs-val">{docs.done} / {docs.total} ready</span>
          </div>
          <div className={`opp-bar ${docs.complete ? 'is-full' : ''}`} style={{ marginTop: 6 }}
            role="img" aria-label={`${docs.done} of ${docs.total} documents ready`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="oc-next">
        <div className="oc-next-label">Next</div>
        <div className="oc-next-text">{act.text}</div>
      </div>

      <div className="oc-foot">
        <button className="btn primary" onClick={runCta}>{act.cta}</button>
        {item.apply_link && act.kind !== 'apply' && (
          <a className="icon-btn" href={item.apply_link} target="_blank" rel="noreferrer" title="Open application link">↗</a>
        )}
        <button className="icon-btn" title="Edit" onClick={() => onEdit?.(item)}>✏️</button>
      </div>
    </div>
  );
}

import React from 'react';
import { api, TYPE_MAP, typeColor, daysLeft, fmtDeadline, fmtTime, offsetLabel } from '../api.js';
import { categoryMeta, deadlineCopy, documents, eligibility, hostOf, nextAction, trust } from '../opportunity.js';
import TrustBadge from '../components/TrustBadge.jsx';

export default function DetailPage({ item, onBack, onEdit, onChange, onToast }) {
  if (!item) return <div className="page"><p className="muted">Item not found.</p></div>;

  const type = TYPE_MAP[item.item_type] || TYPE_MAP.other;
  const dl = daysLeft(item.deadline);
  const expired = dl !== null && dl < 0;
  const done = item.status === 'done';
  const isOpp = item.item_type === 'opportunity';

  const toggleDone = async () => {
    await api.update(item.id, { status: done ? 'pending' : 'done' });
    onChange();
    onToast(done ? 'Back to pending.' : isOpp ? 'Marked as applied! 🎉' : 'Done! 🎉');
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await api.remove(item.id);
    onChange();
    onBack();
  };

  const toggleReq = async (idx) => {
    const cur = new Set(item.requirements_done || []);
    cur.has(idx) ? cur.delete(idx) : cur.add(idx);
    await api.update(item.id, { requirements_done: [...cur] });
    onChange();
  };

  const pendingRem = (item.reminders || []).filter((r) => !r.notified);
  const firedRem = (item.reminders || []).filter((r) => r.notified);

  // ---------------- opportunity workspace ----------------
  if (isOpp) {
    const cat = categoryMeta(item.category);
    const t = trust(item);
    const docs = documents(item);
    const elig = eligibility(item);
    const act = nextAction(item);
    const due = deadlineCopy(item);
    const deadlineFlagged = (item.needs_review || []).includes('deadline') || item.confidence?.deadline === 'low';
    const sourceHost = hostOf(item.apply_link) || hostOf(item.source_url);
    const pct = docs.total ? Math.round((docs.done / docs.total) * 100) : 0;

    return (
      <div className="page">
        <button className="btn small ghost" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>

        <div className="page-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* 1-7 — identity, trust, dates, primary action */}
            <div className="card">
              <div className="oc-meta" style={{ marginBottom: 6 }}>
                <span className="type-pill" style={{ '--tp': typeColor('opportunity') }}>{cat.emoji} {cat.label}</span>
                <TrustBadge state={t} size="lg" />
              </div>

              <h2 style={{ margin: '0 0 2px' }}>{item.title}</h2>
              {item.organization && <p className="muted" style={{ margin: 0 }}>{item.organization}</p>}

              <div className="d-countdown">
                <span className={`due-pill ${due.tone}`}>{due.text}</span>
                {done && <span className="d-badge done">✓ Applied</span>}
              </div>

              <div className="d-dates">
                <div className="d-date">
                  <span className="d-date-k">Application deadline</span>
                  <span className="d-date-v">
                    {item.deadline ? fmtDeadline(item.deadline) : 'Not confirmed'}
                    {item.deadline_time && ` · ${fmtTime(item.deadline_time)}`}
                  </span>
                  {deadlineFlagged && <span className="d-warn">⚠ Confirm this date on the official source</span>}
                </div>
                {item.event_date && (
                  <div className="d-date d-date-event">
                    <span className="d-date-k">Programme begins</span>
                    <span className="d-date-v">{fmtDeadline(item.event_date)}</span>
                  </div>
                )}
              </div>

              <div className="detail-actions">
                {item.apply_link ? (
                  <a className="btn primary" href={item.apply_link} target="_blank" rel="noreferrer">Apply now ↗</a>
                ) : (
                  <span className="banner warn" style={{ margin: 0, flex: 1 }}>Application link not confirmed</span>
                )}
                <button className="btn" onClick={toggleDone}>{done ? '↩ Undo' : '✓ Mark as applied'}</button>
              </div>
            </div>

            {/* 8 — next action */}
            {!done && (
              <div className="card d-next">
                <div className="oc-next-label">Next action</div>
                <div className="d-next-text">{act.text}</div>
              </div>
            )}

            {/* 9 — documents */}
            {docs.total > 0 && (
              <div className="card">
                <div className="oc-block" style={{ marginBottom: 8 }}>
                  <span>Documents</span>
                  <span className="oc-docs-val">{docs.done} of {docs.total} ready</span>
                </div>
                <div className={`opp-bar ${docs.complete ? 'is-full' : ''}`} style={{ marginBottom: 10 }}>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="checklist">
                  {docs.list.map((r) => (
                    <label key={r.i}>
                      <input type="checkbox" checked={docs.doneIdx.has(r.i)} onChange={() => toggleReq(r.i)} />
                      <span className={docs.doneIdx.has(r.i) ? 'done-item' : ''}>{r.text}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 10 — eligibility */}
            {elig.total > 0 && (
              <div className="card">
                <h3>Eligibility <span className="muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}>· {elig.total} criteria</span></h3>
                <ul className="rev-ul" style={{ paddingLeft: 18 }}>
                  {elig.list.map((c) => <li key={c.i}>{c.text}</li>)}
                </ul>
                <p className="muted" style={{ fontSize: '0.74rem', margin: '8px 0 0' }}>
                  Criteria decide whether you may apply — confirm them on the official source.
                </p>
              </div>
            )}
          </div>

          <div className="rail">
            {/* 11 — source */}
            <div className="card">
              <h3>Source</h3>
              <div className="d-source">
                <TrustBadge state={t} size="lg" />
                <p className="muted" style={{ fontSize: '0.78rem', margin: '8px 0 0' }}>
                  {t.reasons?.length ? t.reasons.join(' · ') : 'No additional signals.'}
                </p>
              </div>
              {sourceHost && <div className="sum-row"><span>Domain</span><span className="sum-n" style={{ fontWeight: 600 }}>{sourceHost}</span></div>}
              {item.apply_link && (
                <a className="btn small wide" style={{ marginTop: 8 }} href={item.apply_link} target="_blank" rel="noreferrer">Open application page ↗</a>
              )}
              {item.source_url && item.source_url !== item.apply_link && (
                <a className="btn small wide ghost" style={{ marginTop: 6 }} href={item.source_url} target="_blank" rel="noreferrer">Where I found it ↗</a>
              )}
              <p className="muted" style={{ fontSize: '0.72rem', marginTop: 8, marginBottom: 0 }}>
                Mauqa reports what it could read. It does not certify a publisher as official.
              </p>
            </div>

            {/* 12 — reminders */}
            <div className="card">
              <h3>Reminders</h3>
              {(pendingRem.length + firedRem.length) === 0 && <p className="muted" style={{ fontSize: '0.8rem' }}>No reminders scheduled.</p>}
              <div className="timeline">
                {firedRem.map((r) => (
                  <div key={r.id} className="tl-row dim"><span className="muted">{r.label}</span><span className="muted">{r.remind_at.slice(0, 16).replace('T', ' ')} ✓</span></div>
                ))}
                {pendingRem.map((r) => (
                  <div key={r.id} className="tl-row"><span>{r.label}</span><strong style={{ fontSize: '0.78rem' }}>{r.remind_at.slice(0, 16).replace('T', ' ')}</strong></div>
                ))}
              </div>
              {item.deadline && (
                <a className="btn small wide" style={{ marginTop: 10 }} href={`/api/opportunities/${item.id}/ics`}>📆 Add to phone calendar</a>
              )}
            </div>

            {/* 13 — secondary metadata + secondary actions */}
            <div className="card">
              <h3>Details</h3>
              {item.location && <div className="sum-row"><span>Location</span><span className="sum-n" style={{ fontWeight: 600 }}>{item.location}</span></div>}
              {item.compensation && <div className="sum-row"><span>Amount</span><span className="sum-n" style={{ fontWeight: 600 }}>{item.compensation}</span></div>}
              {item.tags?.length > 0 && <div className="sum-row"><span>Tags</span><span className="sum-n" style={{ fontWeight: 600 }}>{item.tags.map((x) => `#${x}`).join(' ')}</span></div>}
              {item.summary && <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>{item.summary}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn small" style={{ flex: 1 }} onClick={() => onEdit(item)}>✏️ Edit</button>
                <button className="btn small danger" onClick={remove}>🗑</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- ordinary item (unchanged behaviour) ----------------
  const statusBadge = done ? ['done', '✓ Done'] : expired ? ['missed', item.status === 'missed' ? 'Missed' : `${-dl}d overdue`] : ['open', 'Open'];

  return (
    <div className="page">
      <button className="btn small ghost" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <div className="page-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="detail-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="type-pill" style={{ '--tp': typeColor(item.item_type) }}>{type.emoji} {type.label}</span>
                <h2>{item.title}</h2>
                {item.organization && <p className="muted" style={{ margin: 0 }}>{item.organization}</p>}
              </div>
              <span className={`d-badge ${statusBadge[0]}`}>{statusBadge[1]}</span>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text2)', margin: '8px 0' }}>
              📅 {fmtDeadline(item.deadline)}{item.deadline_time ? ` · ${fmtTime(item.deadline_time)}` : ''}
              {dl !== null && !done && !expired && <strong style={{ color: dl <= 3 ? 'var(--warn)' : 'var(--good)' }}> · {dl === 0 ? 'today!' : `${dl} day${dl > 1 ? 's' : ''} remaining`}</strong>}
              {item.recurrence !== 'none' && ` · 🔁 ${item.recurrence}`}
            </p>

            <div className="detail-actions">
              {item.apply_link && <a className="btn primary" href={item.apply_link} target="_blank" rel="noreferrer">Open link ↗</a>}
              <button className="btn" onClick={toggleDone}>{done ? '↩ Undo' : '✓ Mark as done'}</button>
              <button className="btn" onClick={() => onEdit(item)}>✏️ Edit</button>
              {item.deadline && <a className="btn" href={`/api/opportunities/${item.id}/ics`}>📆 Calendar</a>}
              <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={remove}>🗑 Delete</button>
            </div>
          </div>

          {item.summary && (
            <div className="card"><h3>Notes</h3><p style={{ margin: 0, fontSize: '0.88rem' }}>{item.summary}</p></div>
          )}
        </div>

        <div className="rail">
          <div className="card">
            <h3>Summary</h3>
            <div style={{ textAlign: 'center', margin: '8px 0 12px' }}>
              <div className="ir-tile" style={{ '--tile': typeColor(item.item_type), width: 62, height: 62, fontSize: '1.7rem', margin: '0 auto' }}>{type.emoji}</div>
            </div>
            <div className="sum-row"><span>Type</span><span className="sum-n" style={{ fontWeight: 600 }}>{type.label}</span></div>
            <div className="sum-row"><span>Date</span><span className="sum-n" style={{ fontWeight: 600 }}>{item.deadline || '—'}</span></div>
            {item.deadline_time && <div className="sum-row"><span>Time</span><span className="sum-n" style={{ fontWeight: 600 }}>{fmtTime(item.deadline_time)}</span></div>}
            <div className="sum-row"><span>Repeat</span><span className="sum-n" style={{ fontWeight: 600, textTransform: 'capitalize' }}>{item.recurrence === 'none' ? 'Never' : item.recurrence}</span></div>
          </div>

          <div className="card">
            <h3>Reminders</h3>
            {(pendingRem.length + firedRem.length) === 0 && <p className="muted" style={{ fontSize: '0.8rem' }}>No reminders scheduled.</p>}
            <div className="timeline">
              {firedRem.map((r) => (
                <div key={r.id} className="tl-row dim"><span className="muted">{r.label}</span><span className="muted">{r.remind_at.slice(0, 16).replace('T', ' ')} ✓</span></div>
              ))}
              {pendingRem.map((r) => (
                <div key={r.id} className="tl-row"><span>{r.label}</span><strong style={{ fontSize: '0.78rem' }}>{r.remind_at.slice(0, 16).replace('T', ' ')}</strong></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

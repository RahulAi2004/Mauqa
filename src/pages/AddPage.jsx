import React, { useEffect, useRef, useState } from 'react';
import { api, TYPES, TYPE_MAP, typeColor, OFFSET_CHOICES, offsetLabel, fmtDeadline, fmtTime } from '../api.js';
import { applyLinkState, categoryMeta, CATEGORIES, detectPayload, sourceIsBlind, sourceState, trust } from '../opportunity.js';
import TrustBadge from '../components/TrustBadge.jsx';

const emptyForm = {
  title: '', item_type: 'task', deadline: '', deadline_time: '', event_date: '', recurrence: 'none',
  organization: '', category: 'other', apply_link: '', location: '', compensation: '',
  eligibility: [], requirements: [], summary: '', tags: [], confidence: {}, needs_review: [],
  source_url: '', source_platform: 'manual', source_type: 'manual', extraction_mode: 'manual',
};

// Capture is the default. Manual entry stays fully intact behind
// "Enter details manually" — mode: capture → processing → review → form.
// Honest stages of the single extraction call — no fabricated network steps.
const PROC_STEPS = [
  ['Understanding content', 'Reading the link, text or screenshot'],
  ['Extracting opportunity', 'Working out what kind of opportunity this is'],
  ['Checking important details', 'Deadline, event date, eligibility, documents'],
  ['Preparing your action card', 'Scoring confidence and flagging anything uncertain'],
];

function ConfBadge({ level }) {
  if (level === 'high') return <span className="conf-badge high">✓ High confidence</span>;
  if (level === 'review') return <span className="conf-badge review">! Needs review</span>;
  return <span className="conf-badge missing">? Missing info</span>;
}

// A single reviewed field: value, or an explicit "not found" — never silently blank.
function ReviewRow({ label, value, badge, missingText = 'Not found' }) {
  return (
    <div className="rev-row">
      <div className="rev-key">{label}</div>
      <div className={`rev-val ${value ? '' : 'is-missing'}`}>{value || missingText}</div>
      {badge}
    </div>
  );
}

export default function AddPage({ item, initial, settings, persona, prefs, onSaved, onCancel, onDelete }) {
  const editing = !!item;
  // Capture is the default for anything new; editing goes straight to the form.
  const [mode, setMode] = useState(editing ? 'form' : 'capture');
  const [form, setForm] = useState(item
    ? { ...emptyForm, ...item, deadline: item.deadline || '', deadline_time: item.deadline_time || '' }
    : { ...emptyForm, item_type: defaultType(persona) });
  const [text, setText] = useState([initial?.url, initial?.text].filter(Boolean).join('\n'));
  const [captured, setCaptured] = useState(null); // { sentUrl, fetched } — what actually happened
  const [showLinkFix, setShowLinkFix] = useState(false);
  const captureRef = useRef(null);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [aiNote, setAiNote] = useState(null);
  const [offsets, setOffsets] = useState(item?.reminder_offsets?.length
    ? item.reminder_offsets
    : settings?.reminder_defaults?.[item?.item_type || defaultType(persona)] || [1440]);
  const offsetsTouched = useRef(editing);
  const [customReminder, setCustomReminder] = useState('');
  const [priority, setPriority] = useState(item?.priority || 'normal');
  const [procStep, setProcStep] = useState(-1); // -1 = not processing
  const [tagInput, setTagInput] = useState('');
  const [wasExtracted, setWasExtracted] = useState(false);

  useEffect(() => {
    if (!offsetsTouched.current) {
      setOffsets(settings?.reminder_defaults?.[form.item_type] || [1440]);
    }
  }, [form.item_type, settings]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const pickImage = (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setError('Screenshot is too large (max 15 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const [, media, data] = String(reader.result).match(/^data:([^;]+);base64,(.*)$/) || [];
      setImage({ data, media_type: media || 'image/png', name: file.name });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const detected = detectPayload(text, image);
  const autoRan = useRef(false);

  const runExtract = async () => {
    const { payload, url } = detected;
    if (!payload.url && !payload.text && !payload.image) {
      setError('Paste a link, some text, or add a screenshot first.');
      return;
    }
    setError(null); setAiNote(null); setBusy(true);
    setMode('processing');
    setProcStep(0);
    // A live extraction takes 6-17s. At 700ms the four steps finished in under
    // three seconds and then sat still, which reads as a hang; pace them to the
    // real call instead.
    const ticker = setInterval(() => setProcStep((s) => Math.min(s + 1, PROC_STEPS.length - 1)), 2600);
    try {
      if (prefs && prefs.auto_extract === false) payload.basicOnly = true;
      const res = await api.extract(payload);
      const d = res.draft;
      setWasExtracted(true);
      setCaptured({ sentUrl: url || null, fetched: !!res.meta?.fetched, usable: !!res.meta?.usable });
      setForm((f) => ({
        ...f, ...d, item_type: 'opportunity',
        deadline: d.deadline || '', deadline_time: d.deadline_time || '',
        organization: d.organization || '', apply_link: d.apply_link || '',
        location: d.location || '', compensation: d.compensation || '',
        event_date: d.event_date || '',
        eligibility: d.eligibility || [], requirements: d.requirements || [],
      }));
      if (d.extraction_mode === 'mock') setAiNote('Basic extraction — no AI key configured. Check every field below.');
      else if (res.aiError) setAiNote(`AI extraction failed (${res.aiError}) — these are basic results.`);
      setMode('review');
    } catch (e) {
      setError(e.message);
      setMode('capture');
    } finally {
      clearInterval(ticker);
      setProcStep(-1);
      setBusy(false);
    }
  };

  // Arriving from the Android share sheet, the user has already decided — making
  // them press Extract is a pointless second tap, so run it once on arrival.
  // Guarded by a ref because runExtract sets state this effect must not re-fire on.
  useEffect(() => {
    if (editing || autoRan.current || !initial?.auto) return;
    if (!initial.url && !initial.text) return;
    autoRan.current = true;
    runExtract();
  }, [initial, editing]);

  // Honest helper: opens a search so the user can locate the real page. Mauqa
  // does not resolve or verify it — whatever they paste is theirs, not ours.
  const findOfficialSource = () => {
    const q = [form.title, form.organization, 'official application'].filter(Boolean).join(' ');
    if (q.trim()) window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener,noreferrer');
    setShowLinkFix(true);
  };

  const restart = () => {
    setForm({ ...emptyForm, item_type: defaultType(persona) });
    setText(''); setImage(null); setCaptured(null); setWasExtracted(false);
    setAiNote(null); setError(null); setShowLinkFix(false); setMode('capture');
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (t && !(form.tags || []).includes(t)) set('tags', [...(form.tags || []), t]);
    setTagInput('');
  };

  const save = async () => {
    if (!form.title?.trim()) { setError('Give it a title.'); setMode('form'); return; }
    setBusy(true); setError(null);
    try {
      const payload = {
        opportunity: { ...form, priority, status: form.status || 'pending' },
        reminderOffsets: form.deadline ? offsets : [],
        customReminders: customReminder ? [customReminder] : [],
      };
      if (editing) {
        const { opportunity, ...rest } = payload;
        await api.update(item.id, { ...opportunity, ...rest });
      } else {
        await api.create(payload);
      }
      onSaved({ scheduled: !!(form.deadline && offsets.length) });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const needsReview = new Set(form.needs_review || []);
  const flag = (f) => needsReview.has(f) || form.confidence?.[f] === 'low';
  const confLevel = (f) => {
    if (!form[f]) return 'missing';
    if (needsReview.has(f) || ['low', 'medium'].includes(form.confidence?.[f])) return 'review';
    return 'high';
  };
  const isOpp = form.item_type === 'opportunity';
  const type = TYPE_MAP[form.item_type];

  const processingPanel = (
    <div style={{ padding: '18px 6px', textAlign: 'center' }}>
      <div className="spinner" />
      <h3 style={{ margin: '4px 0' }}>Analysing content…</h3>
      <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>Sit tight! We're extracting the important details.</p>
      <div className="proc-steps" style={{ textAlign: 'left', maxWidth: 420, margin: '10px auto 0' }}>
        {PROC_STEPS.map(([t, sub], i) => (
          <div key={i} className={`proc-step ${i < procStep ? 'done' : i === procStep ? 'now' : ''}`}>
            <span className="ps-dot">{i < procStep ? '✓' : i + 1}</span>
            <div><strong style={{ fontSize: '0.85rem' }}>{t}</strong><div className="muted" style={{ fontSize: '0.73rem' }}>{sub}</div></div>
            <span className="ps-tag">{i < procStep ? 'Complete' : i === procStep ? 'In progress' : 'Pending'}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '0.74rem', marginTop: 10 }}>🛡 MAUQA never silently saves uncertain information — you'll review everything before saving.</p>
    </div>
  );

  return (
    <div className="page">
      <div className="addpage-grid">
        <div className="card">
          {mode !== 'review' && (
            <>
              <h3 style={{ marginBottom: 2 }}>
                {editing ? 'Edit item' : mode === 'form' ? 'Enter details manually' : 'Add to Mauqa'}
              </h3>
              <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.83rem' }}>
                {editing
                  ? 'Update the details — reminders regenerate automatically.'
                  : mode === 'form'
                    ? 'Fill in whatever you know. Nothing is extracted or verified on this path.'
                    : 'Paste a link, drop a screenshot, or paste the caption. Mauqa works out what it is and shows you everything before anything is saved.'}
              </p>
            </>
          )}

          {mode === 'processing' && processingPanel}

          {mode === 'capture' && (
            <>
              <div className="cap-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickImage(e.dataTransfer.files?.[0]); }}>
                <div className="cap-affs">
                  <button className="cap-aff" onClick={() => captureRef.current?.focus()}>
                    <span className="cap-ico">🔗</span><strong>Paste a link</strong><span className="muted">Reel, post or page</span>
                  </button>
                  <label className="cap-aff">
                    <span className="cap-ico">📸</span><strong>Upload screenshot</strong><span className="muted">Poster or story</span>
                    <input type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
                  </label>
                  <button className="cap-aff" onClick={() => captureRef.current?.focus()}>
                    <span className="cap-ico">📝</span><strong>Paste text</strong><span className="muted">Caption or message</span>
                  </button>
                </div>

                <textarea
                  ref={captureRef} rows={5} autoFocus value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Paste anything you found — a link, the caption, the whole post. Mauqa works out what it is."
                />

                {image && (
                  <div className="cap-file">
                    ✅ {image.name}
                    <button className="icon-btn" title="Remove" onClick={() => setImage(null)}>✕</button>
                  </div>
                )}

                {detected.kinds.length > 0 && (
                  <div className="cap-detected">
                    Detected: {detected.kinds.map((k) => <span key={k} className="chip tiny">{k}</span>)}
                  </div>
                )}
              </div>

              {error && <p className="error">{error}</p>}

              <button className="btn primary wide" style={{ marginTop: 12 }} disabled={busy} onClick={runExtract}>
                {busy ? 'Extracting…' : '✨ Extract details'}
              </button>
              <p style={{ textAlign: 'center', marginTop: 10, marginBottom: 0 }}>
                <button className="linklike" onClick={() => setMode('form')}>Enter details manually</button>
              </p>
            </>
          )}

          {mode === 'review' && (() => {
            const src = sourceState(captured || {});
            const link = applyLinkState(form.apply_link, captured || {});
            const elig = form.eligibility || [];
            const docs = form.requirements || [];
            const deadlineText = form.deadline
              ? fmtDeadline(form.deadline) + (form.deadline_time ? ` · ${fmtTime(form.deadline_time)}` : '')
              : null;
            return (
              <>
                {(() => {
                  const t = trust({ ...form, extraction_mode: form.extraction_mode });
                  const partial = !form.deadline || !form.apply_link || (form.needs_review || []).length > 0;
                  return (
                    <>
                      <div className="oc-meta" style={{ marginBottom: 6 }}>
                        <TrustBadge state={t} size="lg" />
                      </div>
                      <h3 style={{ margin: '2px 0' }}>
                        {partial ? 'We found part of this opportunity' : 'Review what we found'}
                      </h3>
                      <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.82rem' }}>
                        {partial
                          ? 'Everything Mauqa could not establish is marked below — nothing is left blank, and nothing is saved until you confirm.'
                          : 'Nothing is saved until you confirm.'}
                      </p>
                    </>
                  );
                })()}
                {aiNote && <p className="banner warn">{aiNote}</p>}

                {/* The single most common dead end: a social link that loads but
                    hides its caption. Say so before the user reads a card full of
                    "not found" and concludes the extractor is broken. */}
                {sourceIsBlind(captured || {}) && (
                  <div className="banner warn blind-src">
                    <strong>{src.host} ne post ka text nahi diya.</strong>
                    <span>
                      Reels aur posts login ke peeche hote hain, isliye link se sirf itna hi mila.
                      Poori detail ke liye <strong>caption paste karo</strong> ya <strong>screenshot share karo</strong> —
                      dono se deadline, eligibility aur documents nikal aate hain.
                    </span>
                    <button className="btn small" onClick={restart}>↺ Caption ya screenshot se try karo</button>
                  </div>
                )}

                <div className="rev-list">
                  <ReviewRow label="Title" value={form.title} badge={<ConfBadge level={confLevel('title')} />} missingText="No title found" />
                  <ReviewRow label="Organization" value={form.organization} badge={<ConfBadge level={confLevel('organization')} />} missingText="Not stated" />
                  <ReviewRow label="Deadline" value={deadlineText} badge={<ConfBadge level={confLevel('deadline')} />} missingText="No deadline found" />
                  <ReviewRow label="Event date" value={form.event_date ? fmtDeadline(form.event_date) : null}
                    missingText="No start/event date stated" />
                  <ReviewRow label="Category" value={`${categoryMeta(form.category).emoji} ${categoryMeta(form.category).label}`} />

                  <div className="rev-row">
                    <div className="rev-key">Official source</div>
                    <div className={`rev-val ${src.level === 'loaded' ? '' : 'is-missing'}`}>{src.label}</div>
                    {src.level === 'loaded'
                      ? <span className="conf-badge high">✓ Reached</span>
                      : <span className="conf-badge missing">? Unconfirmed</span>}
                  </div>
                  {src.level !== 'loaded' && (
                    <div className="rev-fix">
                      <span className="muted">
                        {src.level === 'empty'
                          ? 'The page opened but its content is gated, so nothing here is verified against a publisher.'
                          : 'Mauqa could not open the page it was given, so nothing here is verified against a publisher.'}
                      </span>
                      <button className="btn small" onClick={findOfficialSource}>🔎 Find official source</button>
                    </div>
                  )}

                  <div className="rev-row">
                    <div className="rev-key">Apply link</div>
                    <div className={`rev-val ${link.level === 'missing' ? 'is-missing' : ''}`}>
                      {form.apply_link
                        ? <a href={form.apply_link} target="_blank" rel="noreferrer">{form.apply_link}</a>
                        : 'Official application link not confirmed'}
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>{link.label}</div>
                    </div>
                    {link.level === 'loaded'
                      ? <span className="conf-badge high">✓ Reached</span>
                      : link.level === 'missing'
                        ? <span className="conf-badge missing">? Missing</span>
                        : <span className="conf-badge review">! Needs review</span>}
                  </div>
                  {link.level !== 'loaded' && (
                    <div className="rev-fix">
                      {!showLinkFix && <button className="btn small" onClick={findOfficialSource}>🔎 Find official source</button>}
                      {showLinkFix && (
                        <>
                          <input value={form.apply_link} onChange={(e) => set('apply_link', e.target.value)}
                            placeholder="Paste the official application link you found…" style={{ margin: 0 }} />
                          <span className="muted" style={{ fontSize: '0.74rem' }}>
                            Saved as entered by you — Mauqa does not check whether a link is official.
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="rev-group">
                    <div className="rev-key">Eligibility</div>
                    {elig.length === 0
                      ? <div className="rev-val is-missing">No eligibility criteria found — check the original post</div>
                      : <ul className="rev-ul">{elig.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  </div>

                  <div className="rev-group">
                    <div className="rev-key">Required documents</div>
                    {docs.length === 0
                      ? <div className="rev-val is-missing">No documents listed — check the original post</div>
                      : <ul className="rev-ul">{docs.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  </div>

                  {(form.needs_review || []).length > 0 && (
                    <p className="banner warn" style={{ marginTop: 4 }}>
                      ! Needs review: <strong>{form.needs_review.join(', ')}</strong> — the extractor was not confident about these.
                    </p>
                  )}
                </div>

                {error && <p className="error">{error}</p>}

                <div className="rev-cta">
                  <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : '✓ Save & Track'}</button>
                  <button className="btn" onClick={() => setMode('form')}>✏️ Edit details</button>
                  <button className="btn ghost" onClick={restart}>↺ Start over</button>
                </div>
              </>
            );
          })()}

          {mode === 'form' && (
            <>
              {!editing && (
                <p style={{ margin: '0 0 10px' }}>
                  <button className="linklike" onClick={() => setMode(wasExtracted ? 'review' : 'capture')}>
                    ← Back to {wasExtracted ? 'review' : 'capture'}
                  </button>
                </p>
              )}
              {aiNote && <p className="banner info">{aiNote}</p>}

              <label>Type</label>
              <div className="type-row">
                {TYPES.map((t) => (
                  <button key={t.key} className={`chip ${form.item_type === t.key ? 'chip-active' : ''}`} onClick={() => set('item_type', t.key)}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>

              <div className="field-head">
                <label className={flag('title') ? 'flagged' : ''}>{flag('title') && '⚠ '}Title *</label>
                {wasExtracted && <ConfBadge level={confLevel('title')} />}
              </div>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Chemistry test" />

              <div className="row3">
                <div>
                  <div className="field-head">
                    <label className={flag('deadline') ? 'flagged' : ''}>{flag('deadline') && '⚠ '}Date</label>
                    {wasExtracted && <ConfBadge level={confLevel('deadline')} />}
                  </div>
                  <input type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
                </div>
                <div>
                  <label>Time <span className="muted">(optional)</span></label>
                  <input type="time" value={form.deadline_time} onChange={(e) => set('deadline_time', e.target.value)} />
                </div>
                <div>
                  <label>Repeat</label>
                  <select value={form.recurrence} onChange={(e) => set('recurrence', e.target.value)}>
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="row2">
                <div>
                  <label className={flag('organization') ? 'flagged' : ''}>{isOpp ? 'Organization' : 'With / at'} <span className="muted">(optional)</span></label>
                  <input value={form.organization} onChange={(e) => set('organization', e.target.value)} />
                </div>
                <div>
                  <label>Location <span className="muted">(optional)</span></label>
                  <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Room 204 / Online" />
                </div>
              </div>

              <label>Priority</label>
              <div className="prio-seg">
                {[['low', '🟢 Low'], ['normal', '🟠 Medium'], ['high', '🔴 High']].map(([v, l]) => (
                  <button key={v} className={priority === v ? `on-${v === 'normal' ? 'normal' : v}` : ''} onClick={() => setPriority(v)}>{l}</button>
                ))}
              </div>

              {isOpp && (
                <>
                  <div className="row2">
                    <div>
                      <label>Category</label>
                      <select value={form.category} onChange={(e) => set('category', e.target.value)}>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{categoryMeta(c).emoji} {categoryMeta(c).label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Compensation / amount</label>
                      <input value={form.compensation} onChange={(e) => set('compensation', e.target.value)} />
                    </div>
                  </div>
                  <label>Event / start date <span className="muted">(when it actually happens — not the deadline)</span></label>
                  <input type="date" value={form.event_date || ''} onChange={(e) => set('event_date', e.target.value)} />
                </>
              )}

              <div className="field-head">
                <label className={flag('apply_link') ? 'flagged' : ''}>{flag('apply_link') && '⚠ '}Link <span className="muted">(apply / meeting / payment)</span></label>
                {wasExtracted && <ConfBadge level={confLevel('apply_link')} />}
              </div>
              <input value={form.apply_link} onChange={(e) => set('apply_link', e.target.value)} placeholder="https://…" />

              {isOpp && (
                <>
                  <label>Eligibility <span className="muted">(who may apply — one per line)</span></label>
                  <textarea rows={3} value={(form.eligibility || []).join('\n')}
                    placeholder={'CGPA 3.0 or above\nOpen to Pakistani nationals'}
                    onChange={(e) => set('eligibility', e.target.value.split('\n').filter((l) => l.trim()))} />

                  <label>Required documents <span className="muted">(what you must produce — one per line)</span></label>
                  <textarea rows={3} value={(form.requirements || []).join('\n')}
                    placeholder={'Attested transcript\nUpdated CV'}
                    onChange={(e) => set('requirements', e.target.value.split('\n').filter((l) => l.trim()))} />
                </>
              )}

              <label>Tags <span className="muted">(press Enter to add)</span></label>
              <div className="tags-input">
                {(form.tags || []).map((t) => (
                  <span key={t} className="tag-chip">#{t}<button onClick={() => set('tags', form.tags.filter((x) => x !== t))}>✕</button></span>
                ))}
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                  placeholder={form.tags?.length ? '' : 'e.g. chemistry, urgent…'} />
              </div>

              <label>Notes <span className="muted">(optional)</span></label>
              <textarea rows={2} value={form.summary || ''} onChange={(e) => set('summary', e.target.value)} placeholder="Add any additional notes…" />

              {form.deadline ? (
                <fieldset className="reminders-box">
                  <legend>⏰ Remind me</legend>
                  <div className="preset-grid">
                    {OFFSET_CHOICES.map((o) => (
                      <label key={o.m} className="check">
                        <input type="checkbox" checked={offsets.includes(o.m)}
                          onChange={(e) => {
                            offsetsTouched.current = true;
                            setOffsets((cur) => e.target.checked ? [...cur, o.m].sort((a, b) => b - a) : cur.filter((m) => m !== o.m));
                          }} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <label className="muted" style={{ marginTop: 6 }}>Extra one-off reminder</label>
                  <input type="datetime-local" value={customReminder} onChange={(e) => setCustomReminder(e.target.value)} />
                </fieldset>
              ) : (
                <p className="banner warn">No date set — no reminders will fire.</p>
              )}

              {error && <p className="error">{error}</p>}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
                <button className="btn ghost" onClick={onCancel}>Cancel</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {editing && <button className="btn danger" onClick={() => onDelete?.(item)}>🗑 Delete Reminder</button>}
                  <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? '✓ Save Changes' : '✓ Save Reminder'}</button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rail">
          {mode === 'capture' && !wasExtracted && (
            <div className="card">
              <h3>What happens next</h3>
              {PROC_STEPS.map(([t, sub], i) => (
                <div key={i} className="insight">
                  <span className="in-ico" style={{ background: 'var(--primary-soft)' }}>{i + 1}</span>
                  <div><strong style={{ fontSize: '0.82rem' }}>{t}</strong><div className="muted" style={{ fontSize: '0.74rem' }}>{sub}</div></div>
                </div>
              ))}
              <p className="banner info" style={{ fontSize: '0.74rem' }}>
                🛡 Mauqa shows you every field it found — and every field it could not — before anything is saved.
              </p>
            </div>
          )}
          <div className="card preview-card">
            <div className="pv-head">
              <h3 style={{ margin: 0 }}>Preview</h3>
              <span className="type-pill" style={{ '--tp': typeColor(form.item_type) }}>{type.emoji} {type.label}</span>
            </div>
            <p className="pv-title">{form.title || 'Untitled reminder'}</p>
            {form.summary && <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 6px' }}>{form.summary}</p>}
            <p className="pv-line">📅 {form.deadline ? fmtDeadline(form.deadline) : 'No date'}{form.deadline_time ? ` · ${fmtTime(form.deadline_time)}` : ''}</p>
            {form.location && <p className="pv-line">📍 {form.location}</p>}
            {form.recurrence !== 'none' && <p className="pv-line">🔁 Repeats {form.recurrence}</p>}
            <p className="pv-line">{priority === 'high' ? '🔴 High' : priority === 'low' ? '🟢 Low' : '🟠 Medium'} priority</p>
            {form.deadline && offsets.length > 0 && (
              <div className="pv-rem">
                <strong style={{ fontSize: '0.82rem' }}>Reminders</strong>
                {offsets.map((m) => <p key={m}>🔔 {offsetLabel(m)}</p>)}
                {customReminder && <p>🔔 Custom · {customReminder.replace('T', ' ')}</p>}
              </div>
            )}
          </div>
          {wasExtracted && (
            <div className="card">
              <h3>Confidence Guide</h3>
              <div className="insight"><span className="in-ico" style={{ background: 'var(--good-soft)' }}>✓</span><div><strong style={{ fontSize: '0.82rem' }}>High confidence</strong><div className="muted" style={{ fontSize: '0.75rem' }}>AI is very sure about this information.</div></div></div>
              <div className="insight"><span className="in-ico" style={{ background: 'var(--warn-soft)' }}>!</span><div><strong style={{ fontSize: '0.82rem' }}>Needs review</strong><div className="muted" style={{ fontSize: '0.75rem' }}>AI is partially sure — please verify this detail.</div></div></div>
              <div className="insight"><span className="in-ico" style={{ background: 'var(--surface2)' }}>?</span><div><strong style={{ fontSize: '0.82rem' }}>Missing information</strong><div className="muted" style={{ fontSize: '0.75rem' }}>AI could not find this — fill it yourself.</div></div></div>
              <p className="banner info" style={{ fontSize: '0.74rem' }}>🛡 MAUQA never saves uncertain information without your confirmation.</p>
            </div>
          )}
          <div className="card" style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>
            💡 <strong>Tip:</strong> you can edit or reschedule this reminder anytime — reminders regenerate whenever the date changes.
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultType(persona) {
  return { student: 'test', professional: 'meeting', business: 'meeting', freelancer: 'task', general: 'task' }[persona] || 'task';
}

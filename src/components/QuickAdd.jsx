import React, { useEffect, useRef, useState } from 'react';
import { api, TYPES, TYPE_MAP, fmtDeadline, fmtTime, offsetLabel } from '../api.js';
import { parseQuick } from '../quickparse.js';
import { useSpeech } from './useSpeech.js';

// The one-line magic bar: type "physics test friday 9am" → chips show what was
// understood → Enter saves with your default reminders for that type.
export default function QuickAdd({ settings, aiLive, onSaved, inputRef }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!text.trim()) { setParsed(null); return; }
    debounce.current = setTimeout(() => setParsed(parseQuick(text)), 150);
    return () => clearTimeout(debounce.current);
  }, [text]);

  const save = async (p = parsed) => {
    if (!p?.title || busy) return;
    setBusy(true);
    try {
      const offsets = settings?.reminder_defaults?.[p.item_type];
      await api.create({
        opportunity: {
          title: p.title,
          item_type: p.item_type,
          deadline: p.deadline,
          deadline_time: p.deadline_time,
          recurrence: p.recurrence || 'none',
          status: 'pending',
          extraction_mode: 'quick',
        },
        reminderOffsets: p.deadline ? offsets : [],
      });
      setText('');
      setParsed(null);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const aiParse = async (raw = text) => {
    const line = raw.trim();
    if (!line || aiBusy) return;
    setAiBusy(true);
    try {
      const { parsed: p } = await api.quickparse(line);
      setParsed({ ...p, recurrence: p.recurrence || 'none' });
    } catch {
      setParsed(parseQuick(line)); // AI unavailable — local parse stands
    } finally {
      setAiBusy(false);
    }
  };

  // Speech is messier than typing — a dropped word or a mangled "parso" is normal.
  // So the transcript lands in the input for review and, when AI is available,
  // gets the smarter parse automatically. Nothing is saved until Add is pressed.
  const speech = useSpeech({
    onFinal: (transcript) => {
      setText(transcript);
      if (aiLive) aiParse(transcript);
    },
  });

  const cycleType = () => {
    if (!parsed) return;
    const idx = TYPES.findIndex((t) => t.key === parsed.item_type);
    setParsed({ ...parsed, item_type: TYPES[(idx + 1) % TYPES.length].key });
  };

  const type = parsed && TYPE_MAP[parsed.item_type];
  const defaults = parsed && settings?.reminder_defaults?.[parsed.item_type];

  return (
    <div className="quickadd">
      <div className="quickadd-row">
        <span className="quickadd-icon">⚡</span>
        <input
          ref={inputRef}
          value={speech.listening && speech.interim ? speech.interim : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(''); setParsed(null); } }}
          placeholder={speech.listening
            ? 'Listening… say what you need to do and when'
            : 'What do you need to act on? — "submit scholarship docs friday", "meeting with client kal 3pm"…  (press /)'}
        />
        {speech.supported && (
          <button
            className={`btn small ghost mic-btn ${speech.listening ? 'is-live' : ''}`}
            title={speech.listening ? 'Stop listening' : 'Speak instead of typing'}
            aria-label={speech.listening ? 'Stop listening' : 'Speak instead of typing'}
            aria-pressed={speech.listening}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            {speech.listening ? '⏹' : '🎙'}
          </button>
        )}
        {aiLive && text.trim() && (
          <button className="btn small ghost" title="Let AI parse this line" disabled={aiBusy} onClick={aiParse}>
            {aiBusy ? '…' : '✨'}
          </button>
        )}
        <button className="btn primary small" disabled={!parsed?.title || busy} onClick={() => save()}>
          {busy ? '…' : 'Add'}
        </button>
      </div>

      {speech.error && (
        <p className="quickadd-note error" onClick={speech.clearError}>{speech.error}</p>
      )}
      {speech.listening && !speech.interim && (
        <p className="quickadd-note muted">🎙 Listening… e.g. “meeting with Ali kal 3 pm”</p>
      )}

      {parsed && (
        <div className="quickadd-chips">
          <button className="chip type" onClick={cycleType} title="Tap to change type">
            {type.emoji} {type.label}
          </button>
          <span className={`chip ${parsed.deadline ? '' : 'chip-warn'}`}>
            📅 {parsed.deadline ? fmtDeadline(parsed.deadline) : 'no date — no reminders'}
            {parsed.deadline_time ? ` · ${fmtTime(parsed.deadline_time)}` : ''}
          </span>
          {parsed.recurrence !== 'none' && <span className="chip">🔁 {parsed.recurrence}</span>}
          {parsed.deadline && defaults?.length > 0 && (
            <span className="chip chip-dim" title="Change defaults in Settings ⚙">
              ⏰ {defaults.map(offsetLabel).join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

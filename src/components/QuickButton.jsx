import React, { useCallback, useEffect, useRef, useState } from 'react';

// An AssistiveTouch-style floating button — dimmed while idle so it never fights
// the page for attention, full strength the moment you touch it, draggable, and
// it expands into the two or three things worth reaching in one tap.
//
// It floats INSIDE Mauqa only. Drawing over other apps needs Android's
// SYSTEM_ALERT_WINDOW permission, which a web app cannot hold — so this is a
// shortcut within the app, not a system overlay, and the Settings copy says so.

const POS_KEY = 'mauqa_quickbtn_pos';
const EDGE = 12;          // keep it off the very edge of the screen
const DRAG_SLOP = 6;      // movement beyond this is a drag, not a tap

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (p && typeof p.right === 'number' && typeof p.bottom === 'number') return p;
  } catch { /* corrupt or absent — fall through to the default corner */ }
  return null;
}

export default function QuickButton({ onCapture, onQuickAdd, onAlerts, alertCount = 0 }) {
  // Default sits above the mobile bottom bar so it never covers navigation.
  const [pos, setPos] = useState(() => loadPos() || { right: 18, bottom: 92 });
  const [open, setOpen] = useState(false);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  const btnRef = useRef(null);
  const drag = useRef(null);
  const sleepTimer = useRef(null);

  // Any interaction brings it to full opacity; it fades back once you stop.
  const wake = useCallback(() => {
    setAwake(true);
    clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAwake(false), 2600);
  }, []);

  useEffect(() => () => clearTimeout(sleepTimer.current), []);

  // While the menu is open the button must stay lit.
  useEffect(() => {
    if (open) { setAwake(true); clearTimeout(sleepTimer.current); }
    else wake();
  }, [open, wake]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!btnRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const onPointerDown = (e) => {
    // Ignore secondary buttons so a right-click never starts a drag.
    if (e.button != null && e.button !== 0) return;
    wake();
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      right: pos.right, bottom: pos.bottom,
      moved: false, id: e.pointerId,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) { d.moved = true; setDragging(true); setOpen(false); }
    // right/bottom anchored, so movement is inverted.
    const size = btnRef.current?.offsetWidth || 52;
    setPos({
      right: clamp(d.right - dx, EDGE, window.innerWidth - size - EDGE),
      bottom: clamp(d.bottom - dy, EDGE, window.innerHeight - size - EDGE),
    });
  };

  const endDrag = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(d.id);
    if (d.moved) {
      setDragging(false);
      setPos((p) => { localStorage.setItem(POS_KEY, JSON.stringify(p)); return p; });
      return; // a drag is not a tap
    }
    setOpen((o) => !o);
  };

  const run = (fn) => { setOpen(false); wake(); fn?.(); };

  const actions = [
    { key: 'capture', icon: '➕', label: 'Capture', run: () => run(onCapture) },
    { key: 'quick', icon: '⚡', label: 'Quick add', run: () => run(onQuickAdd) },
    { key: 'alerts', icon: '🔔', label: 'Alerts', run: () => run(onAlerts), badge: alertCount },
  ];

  return (
    <div
      className={`qbtn-wrap ${open ? 'is-open' : ''} ${awake || open ? 'is-awake' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ right: pos.right, bottom: pos.bottom }}
      ref={btnRef}
    >
      {open && (
        <div className="qbtn-menu" role="menu">
          {actions.map((a) => (
            <button key={a.key} className="qbtn-item" role="menuitem" onClick={a.run}>
              <span className="qbtn-item-ico">
                {a.icon}
                {a.badge > 0 && <span className="qbtn-item-badge">{a.badge}</span>}
              </span>
              <span className="qbtn-item-label">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="qbtn"
        aria-label={open ? 'Close quick actions' : 'Quick actions'}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseEnter={wake}
      >
        <span className="qbtn-glyph">{open ? '✕' : '🎯'}</span>
        {!open && alertCount > 0 && <span className="qbtn-badge">{alertCount}</span>}
      </button>
    </div>
  );
}

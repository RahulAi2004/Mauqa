import React from 'react';
import { APK_URL, isAndroid } from '../api.js';

// Where the Android app is offered. Two shapes, one source of truth:
//   banner — dismissible, shown once after sign-in on Android
//   card   — permanent, lives in Settings
//
// The APK is a packaged build of this same PWA: it adds the home-screen icon,
// a standalone window and a slot in the Android share sheet. It is NOT a
// floating overlay and it cannot capture the screen — say so here rather than
// letting the download imply it.
const DISMISS_KEY = 'mauqa_apk_banner_dismissed';

export function AppInstallBanner({ onDismiss }) {
  const [hidden, setHidden] = React.useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  // Desktop users can't install an APK — the PWA install button already covers them.
  if (!APK_URL || hidden || !isAndroid()) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setHidden(true);
    onDismiss?.();
  };

  return (
    <div className="apk-banner">
      <span className="apk-ico">📲</span>
      <div className="apk-copy">
        <strong>Get Mauqa on your phone</strong>
        <span className="muted">Share any post straight to Mauqa from Instagram, WhatsApp or your browser.</span>
      </div>
      <a className="btn primary small" href={APK_URL} target="_blank" rel="noreferrer">Download</a>
      <button className="icon-btn" title="Not now" onClick={dismiss}>✕</button>
    </div>
  );
}

export default function GetAppCard({ installPrompt, onInstall }) {
  return (
    <div className="card">
      <h3>Mauqa on your phone</h3>
      <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 10px' }}>
        Once installed, Mauqa joins the Android share sheet — send a post to it from any
        app and it opens straight into Capture.
      </p>

      {APK_URL ? (
        <a className="btn primary small wide" href={APK_URL} target="_blank" rel="noreferrer">
          ⬇ Download Android app (.apk)
        </a>
      ) : (
        <p className="banner info" style={{ fontSize: '0.76rem' }}>
          The Android build isn’t published yet — install the web app below instead. It
          behaves the same, including the share sheet.
        </p>
      )}

      <button className="btn small wide" style={{ marginTop: 8 }} onClick={onInstall}>
        📲 Install web app {installPrompt ? '' : '(how-to)'}
      </button>

      <p className="muted" style={{ fontSize: '0.72rem', marginTop: 10, marginBottom: 0 }}>
        The app is a packaged build of this site. It does not float over other apps and
        does not read your screen — you share things to it, it never watches.
      </p>
    </div>
  );
}

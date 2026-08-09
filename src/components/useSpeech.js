// Voice input via the browser's own speech recognition — no API key, no audio
// ever leaves the normal Chrome pipeline, nothing added to the server.
//
// Two hard constraints worth knowing before using this:
//   1. It only exists in Chrome/Edge (and Chrome on Android). Safari and Firefox
//      report unsupported, so every caller must keep a typing path.
//   2. It needs a secure origin. On http:// (other than localhost) the browser
//      denies the microphone outright.

import { useCallback, useEffect, useRef, useState } from 'react';

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export const speechSupported = !!Recognition;

// en-IN handles South Asian English far better than en-US, and leaves Roman Urdu
// ("kal", "parso") in Latin script — which is exactly what the quick parser and
// the AI prompt are written to understand. ur-PK would return Urdu script and
// the local regex parser would not match a single word of it.
const DEFAULT_LANG = 'en-IN';

export function useSpeech({ onFinal, lang = DEFAULT_LANG } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  // A live recogniser holds the microphone open, so it must not outlive the view.
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  const start = useCallback(() => {
    if (!Recognition || recRef.current) return;
    setError(null);
    setInterim('');

    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = false;      // one utterance, then hand back control
    rec.interimResults = true;   // live text while speaking reads as responsive
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);

    rec.onresult = (e) => {
      let final = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else partial += r[0].transcript;
      }
      if (partial) setInterim(partial);
      if (final.trim()) {
        setInterim('');
        finalRef.current?.(final.trim());
      }
    };

    rec.onerror = (e) => {
      // "aborted" is what a deliberate stop() looks like — not worth showing.
      if (e.error === 'aborted') return;
      setError({
        'not-allowed': 'Microphone blocked — allow it in your browser’s site settings.',
        'service-not-allowed': 'Microphone blocked — allow it in your browser’s site settings.',
        'no-speech': 'Didn’t catch that — try again.',
        'audio-capture': 'No microphone found.',
        network: 'Speech recognition needs a connection.',
      }[e.error] || 'Voice input failed — type it instead.');
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
      recRef.current = null;
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      setError('Could not start the microphone.');
    }
  }, [lang]);

  return { supported: speechSupported, listening, interim, error, start, stop, clearError: () => setError(null) };
}

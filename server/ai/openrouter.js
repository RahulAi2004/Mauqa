// OpenRouter provider — the ONLY module that reads OPENROUTER_API_KEY.
//
// Contract (implement these four and you have a new provider):
//   isConfigured() → boolean
//   info()         → { provider, model, configured }
//   verify()       → { ok, reason }        cheap credential check
//   complete(...)  → parsed JSON object    one stateless request
//
// The key never leaves this file: it is not returned by info(), never logged,
// and every outbound error string is scrubbed before it can reach a log line.

const BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-3.5-flash';
const TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 20000);
const MAX_RETRIES = 1; // one retry, only for transient failures

export const PROVIDER = 'openrouter';

const apiKey = () => (process.env.OPENROUTER_API_KEY || '').trim();

export const isConfigured = () => apiKey().length > 0;

// Deliberately excludes the key — this value is served to the browser via /api/status.
export const info = () => ({ provider: PROVIDER, model: MODEL, configured: isConfigured() });

// ---------- logging (never secrets) ----------
const DEBUG = process.env.NODE_ENV !== 'production';

// Defence in depth: even if a provider echoed the key back in an error body,
// it cannot reach stdout.
function scrub(value) {
  const k = apiKey();
  let s = String(value ?? '');
  if (k) s = s.split(k).join('«redacted»');
  return s.replace(/sk-or-[A-Za-z0-9._\-]+/gi, '«redacted»').replace(/\s+/g, ' ').trim().slice(0, 300);
}

const log = (...a) => { if (DEBUG) console.log('[ai:openrouter]', ...a); };
const warn = (...a) => console.warn('[ai:openrouter]', ...a.map(scrub));

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    'X-Title': 'Mauqa', // OpenRouter attribution; carries no secret
  };
}

// ---------- credential + model check ----------
// Two distinct permanent failures exist and they need different reasons:
//   bad key   → /key returns 401/403          → invalid_api_key
//   dead model→ /models/<id>/endpoints is 404 → model_unavailable
// Network problems must NOT disable AI — only explicit rejections do.
export async function verify() {
  if (!isConfigured()) return { ok: false, reason: 'no_api_key' };

  try {
    const res = await fetch(`${BASE}/key`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      warn(`credential check rejected (HTTP ${res.status}) — falling back to basic extraction`);
      return { ok: false, reason: 'invalid_api_key' };
    }
    if (!res.ok) {
      log(`credential check inconclusive (HTTP ${res.status}) — assuming live`);
      return { ok: true, reason: `unverified_http_${res.status}` };
    }
  } catch (e) {
    log(`credential check unreachable (${scrub(e.message)}) — assuming live`);
    return { ok: true, reason: 'unverified_network' };
  }

  // Learn about a dead model at boot rather than burning a request per
  // extraction. Note: a RETIRED model does not 404 here — it returns HTTP 200
  // with an EMPTY endpoints array. Both shapes mean "nothing can serve this".
  try {
    const res = await fetch(`${BASE}/models/${MODEL}/endpoints`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (res.status === 404) {
      warn(`model "${MODEL}" is unknown to OpenRouter — set OPENROUTER_MODEL to a live model`);
      return { ok: false, reason: 'model_unavailable' };
    }
    if (!res.ok) {
      log(`model check inconclusive (HTTP ${res.status}) — assuming live`);
      return { ok: true, reason: `unverified_http_${res.status}` };
    }
    const endpoints = (await res.json().catch(() => null))?.data?.endpoints;
    if (Array.isArray(endpoints) && endpoints.length === 0) {
      warn(`model "${MODEL}" has no available endpoints (retired or unroutable) — set OPENROUTER_MODEL to a live model`);
      return { ok: false, reason: 'model_unavailable' };
    }
    log(`model "${MODEL}" has ${Array.isArray(endpoints) ? endpoints.length : '?'} endpoint(s)`);
  } catch (e) {
    log(`model check unreachable (${scrub(e.message)}) — assuming live`);
    return { ok: true, reason: 'unverified_network' };
  }

  log(`credential + model check ok · model=${MODEL}`);
  return { ok: true, reason: 'verified' };
}

// ---------- JSON parsing ----------
// A malformed body is almost always a truncated one (the model spent the token
// budget on reasoning). Mark it so the retry path treats it like any other
// one-off failure instead of giving up on the first attempt.
function malformed(message) {
  const err = new Error(message);
  err.malformedOutput = true;
  return err;
}

function parseJson(raw) {
  let t = String(raw).trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ }
    }
    throw malformed('Provider did not return valid JSON.');
  }
}

function isTransient(e) {
  if (e?.authFailed) return false;
  if (e?.malformedOutput) return true; // truncated / non-JSON body — worth one more go
  if (typeof e?.status === 'number') return e.status === 408 || e.status === 429 || e.status >= 500;
  return ['TimeoutError', 'AbortError'].includes(e?.name) || e instanceof TypeError; // fetch network failure
}

/**
 * One compact, standalone completion. No conversation history is ever sent —
 * a single user message carrying the prompt and (optionally) one image.
 */
export async function complete({ prompt, image, schema, schemaName = 'result', maxTokens = 2048 }) {
  if (!isConfigured()) throw new Error('OpenRouter is not configured.');

  const content = [{ type: 'text', text: prompt }];
  if (image?.data) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.media_type || 'image/png'};base64,${image.data}` },
    });
  }

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: 'user', content }], // stateless: exactly one turn
    response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
  });

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: headers(),
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const ms = Date.now() - startedAt;

      if (res.status === 401 || res.status === 403) {
        const err = new Error('OpenRouter rejected the API key.');
        err.authFailed = true;
        err.status = res.status;
        throw err;
      }
      if (!res.ok) {
        const detail = scrub(await res.text().catch(() => ''));
        const err = new Error(`OpenRouter returned HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
        err.status = res.status;
        // A 404 here means the model is gone/unroutable — permanent, not transient.
        if (res.status === 404 || /no endpoints found|not a valid model/i.test(detail)) {
          err.modelUnavailable = true;
        }
        throw err;
      }

      const json = await res.json();
      const choice = json?.choices?.[0];
      if (!choice) throw new Error('Provider returned no choices.');
      if (choice.finish_reason === 'content_filter') throw new Error('Extraction was refused by the model.');

      const raw = choice.message?.content;
      const out = Array.isArray(raw) ? raw.map((p) => p?.text || '').join('') : raw;
      if (!out || !String(out).trim()) {
        throw malformed(choice.finish_reason === 'length'
          ? 'Provider ran out of output tokens before returning any JSON.'
          : 'Provider returned an empty message.');
      }

      const parsed = parseJson(out);
      log(`${schemaName} ok · model=${MODEL} · ${ms}ms · tokens=${json?.usage?.total_tokens ?? '?'}${attempt ? ` · after ${attempt} retry` : ''}`);
      return parsed;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES && isTransient(e)) {
        warn(`${schemaName} attempt ${attempt + 1} failed: ${e.message} — retrying once`);
        continue;
      }
      break;
    }
  }

  const err = new Error(scrub(lastError?.message) || 'OpenRouter request failed.');
  err.authFailed = !!lastError?.authFailed;
  err.modelUnavailable = !!lastError?.modelUnavailable;
  warn(`${schemaName} failed: ${err.message}`);
  throw err;
}

# Mauqa 🎯

**Mauqa turns the opportunities you discover — and the things you have to do — into verified, scheduled action.**

*Mauqa* (موقع) is Urdu for *opportunity*.

---

## The problem

A student in Pakistan scrolls Instagram and sees a reel about a **fully-funded scholarship**. They save the reel. The deadline passes. The opportunity is gone.

Not because they didn't care — but because **a saved reel is not a deadline**.

The information that matters is trapped inside a video caption, a poster screenshot, or a link that needs a login. Somebody has to read it, work out the real closing date, check whether they even qualify, list the documents, find the actual application page, and remember all of it weeks later. That work almost never happens.

## The solution

Share the post to Mauqa. It reads the link, screenshot or caption and produces a structured, reviewable card:

- **application deadline** — separated from the event/start date
- **eligibility criteria** — who may apply
- **required documents** — what you must produce
- **application link** — never invented; if the post says *"link in bio"*, Mauqa says so
- **per-field confidence** and a `needs_review` list for anything uncertain
- **reminders**, scheduled automatically to the type of thing it is

Then it tracks the opportunity to its deadline and ranks it by **how soon it closes × how ready you are** — so a scholarship closing in 2 days with 0/5 documents ready outranks one closing in 2 days that's good to go.

Everything else you need to act on lives in the same inbox: meetings, tests, assignments, bills, tasks.

---

## Key features

| | |
|---|---|
| 🎯 **Opportunity tracking** | Scholarships, internships, hackathons, jobs, fellowships, certifications, courses, grants, competitions, admissions — tracked through Saved → Needs check → Preparing → Ready → Applied |
| ✨ **AI capture** | Paste a link, drop a screenshot, or paste a caption. Auto-detects the input type. Powered by Gemini 3.5 Flash via OpenRouter |
| 🛡 **Honest extraction** | Never invents a deadline or an application link. Every uncertain field is flagged before anything is saved |
| ⚡ **Quick add** | One line of natural language — *"submit scholarship docs friday"*, *"meeting with client kal 3pm"*. Understands **English and Roman Urdu** (`kal`, `parso`, `aaj`, `har roz`, `har hafta`) |
| 🔔 **Smart reminders** | Per-type default schedules (tests: 1 week + 3 days + 1 day; meetings: 1 day + 1 hour + 15 min), overridable per item |
| 📆 **Phone-native alarms** | `.ics` export carries each item's own alarm schedule, so your phone rings with Mauqa closed |
| 📅 **Calendar & analytics** | Month view, agenda, completion trends, upcoming load, streaks |
| 📲 **PWA** | Installable, with an Android share-sheet target and a Windows global hotkey (`Ctrl+Alt+M`) |
| 🔒 **Private by default** | Local SQLite, scrypt-hashed passwords, no third-party data services. Export to CSV/JSON anytime |

### Opportunity workflow

```
  DISCOVER          CAPTURE                 REVIEW                 TRACK
  ────────          ───────                 ──────                 ─────
  Instagram    →    paste link         →    deadline          →    Saved
  TikTok            drop screenshot         event date             Needs check
  LinkedIn          paste caption           eligibility            Preparing
  a friend          Android share           documents              Ready to apply
                                            apply link             Applied
                                            confidence
                                              ↓
                                   reminders scheduled automatically
                                   ranked by deadline × readiness
```

Nothing is saved until you confirm it. Fields Mauqa could not establish are shown as **"Official application link not confirmed"** or **"No deadline found"** — never left silently blank.

### Daily planning

The same inbox handles ordinary work. Type your day in one line each and Mauqa parses it locally, instantly, offline:

```
"submit scholarship docs friday"      → 📚 assignment · Fri · reminders at 3d, 1d, 1h
"meeting with client kal 3pm"         → 🤝 meeting    · tomorrow 15:00 · 1d, 1h, 15m
"bijli ka bill 5 aug"                 → 💳 bill       · 5 Aug · 3d, 1d
"gym har roz 7am"                     → ✅ task       · daily at 07:00
```

Opportunity work and daily work meet on the **Today** screen: a *Closing soon* strip above your ordinary tasks.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | **React 18 + Vite 5** — no router, no state library, no UI kit, no chart library (charts are hand-computed SVG) |
| Styling | One hand-written CSS file driven by custom properties; light/dark, 6 accent colours, 3 densities |
| Backend | **Express 4**, ES modules |
| Database | **Node's built-in `node:sqlite`** (`DatabaseSync`) — no ORM, no native build step |
| Auth | `node:crypto` scrypt + httpOnly session cookies — fully local |
| AI | **OpenRouter** → `google/gemini-3.5-flash`, strict JSON-schema structured output + vision |
| PWA | Web app manifest, share-target, minimal service worker |

**Two runtime dependencies: `express` and `@anthropic-ai/sdk`.** Radical dependency minimalism is deliberate — the whole system is one process and one file.

### AI provider

AI lives behind a four-function provider contract in [`server/ai/openrouter.js`](server/ai/openrouter.js) — `isConfigured()`, `info()`, `verify()`, `complete()`. It is the **only** module that reads the API key.

- Model configurable via `OPENROUTER_MODEL`, never hardcoded in more than one place
- Stateless: one user message per extraction, no conversation history
- 20 s timeout, exactly one retry, and only for transient failures (408/429/5xx/network)
- Credential **and model availability** verified at boot — a retired model reports `model_unavailable` instead of failing on every request
- **Works with no key at all**: a local regex extractor keeps the app fully usable, with every field flagged for review

---

## Local setup

**Requirements:** Node.js **22.5+** (for `node:sqlite`). Developed on Node 24.

```bash
git clone https://github.com/<your-username>/Mauqa.git
cd Mauqa
npm install
```

### Environment variables

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | No | — | Enables live AI extraction. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). **Server-side only** — never reaches the browser or bundle |
| `OPENROUTER_MODEL` | No | `google/gemini-3.5-flash` | Any OpenRouter model with structured-output support |
| `OPENROUTER_TIMEOUT_MS` | No | `20000` | Per-request timeout |
| `OPENROUTER_BASE_URL` | No | `https://openrouter.ai/api/v1` | Override for testing |
| `API_PORT` | No | `4200` | Express port |
| `PORT` | No | `5183` | Vite dev-server port |

Without a key the app runs in **basic mode** — local natural-language parsing, regex extraction, every auto-filled field flagged. The header badge and `/api/status` tell you which mode you're in.

### Run commands

```bash
npm run dev        # API on :4200 + web on :5183  ← development
npm run dev:api    # API only
npm run dev:web    # web only
```

### Build commands

```bash
npm run build      # production bundle → dist/
npm start          # serves the built app AND the API together on :4200
```

`npm start` binds `PORT` when the platform sets one, so it works unchanged on a host.

---

## Deployment

Mauqa is one Node process serving both the API and the built frontend, with SQLite
on local disk. That rules out serverless platforms (Vercel, Netlify Functions) — it
needs a container with a **persistent disk**. Render, Railway and Fly all work.

**Render settings**

| Field | Value |
|---|---|
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm start` |
| Environment | `OPENROUTER_API_KEY` = your key |
| Disk | mount at `/opt/render/project/src/server/data` (1 GB) |

`--include=dev` matters: Vite and React live in `devDependencies`, and hosts that set
`NODE_ENV=production` skip those during install, so the build would fail without it.

Without a mounted disk the SQLite file lives on ephemeral storage and **every account
and saved opportunity disappears on redeploy**.

### Installing on Android (share sheet)

The share target only registers once the PWA is installed, and installation requires
HTTPS — so this works on the deployed URL, not on `localhost`.

1. Open the deployed URL in Chrome on Android
2. Menu (⋮) → **Add to Home screen**
3. In any app (Instagram, WhatsApp, browser) → **Share** → **Mauqa**
4. Capture opens with the post already loaded → **Extract** → review → **Save & Track**

`share_target` is declared in [`public/manifest.webmanifest`](public/manifest.webmanifest);
[`App.jsx`](src/App.jsx) reads the `title`/`text`/`url` params and pulls a link out of the
shared text when the sending app does not provide one separately.

### Packaging the APK

The Android build is a TWA wrapper around the deployed site — no separate codebase.

1. Deploy first; the packager needs a live HTTPS URL
2. Go to **pwabuilder.com**, enter the URL, package for Android, download the zip
3. Copy the `assetlinks.json` it generates to `public/.well-known/assetlinks.json`
   (Vite copies `public/` into `dist/`, so the server picks it up). Without it the app
   shows a Chrome address bar instead of running standalone
4. Host the `.apk` somewhere public — a GitHub Release asset works
5. Set `VITE_APK_URL` to that link and **rebuild**. The value is inlined at build time,
   so a redeploy is required for it to appear

Until `VITE_APK_URL` is set, every download affordance stays hidden and the app offers
the browser's own install prompt instead — no dead links.

What the APK adds: home-screen icon, standalone window, and a slot in the Android share
sheet. What it does **not** add: a floating overlay or screen capture. Those need native
permissions a packaged web app cannot hold — see Known limitations.

---

## Architecture

```
  Browser — React 18 PWA
     │  fetch /api/*   (httpOnly session cookie)
     ▼
  Express :4200
     ├── auth.js         scrypt hashing · sessions · rate limiting
     ├── db.js           node:sqlite · idempotent additive migrations
     ├── extract.js      JSON schemas · prompt rules · regex fallback
     │      └── ai/openrouter.js  ──►  OpenRouter ──► gemini-3.5-flash
     ├── fetchMeta.js    OG-tag + page-text scraper (SSRF-guarded)
     ├── time.js         HH:mm / YYYY-MM-DD normalisation
     ├── ics.js          RFC-5545 export with VALARM + RRULE
     └── index.js        routes · reminder computation · recurrence roll-forward
     ▼
  server/data/mauqa.db   (SQLite, WAL)
```

**No background job, no scheduler, no queue.** Recurring items roll forward lazily on read; reminders are materialised rows the client polls. Schema changes are idempotent `ALTER TABLE` statements applied at boot, so the database self-upgrades with no migration tooling.

### Data model

- **`opportunities`** — one table for all item types. `deadline` (apply by) and `event_date` (happens on) are separate; `eligibility` (who may apply) and `requirements` (what to produce) are separate columns; provenance (`source_url`, `extraction_mode`, `confidence`, `needs_review`) travels with every record
- **`reminders`** — materialised rows, so snooze and acknowledgement are trivial
- **`users` / `sessions` / `settings`** — per-user, all queries scoped by `user_id`

### Security

SSRF guard on URL fetching · CSV formula-injection guard · every query scoped by `user_id` · uniform login failure · brute-force rate limiting · scrypt password hashing · API key never logged, never bundled, never returned by any endpoint.

---

## Known limitations

- **Reminder polling needs an open tab.** The in-app poll runs every 30 s while the app is open; true push (Web Push/VAPID) is not implemented. The `.ics` export is the workaround — those alarms fire with Mauqa closed
- **Instagram and TikTok gate content behind login**, so link extraction on those platforms often has only Open Graph metadata. This is exactly why the screenshot path exists
- **Source verification is not implemented yet.** Mauqa reports whether it could *load* a page — it does not verify that a domain is the official publisher. The UI never claims otherwise
- **iOS cannot join the share sheet**, so the iPhone flow is screenshot → open Mauqa → upload
- **No floating overlay ("bubble") and no screen capture.** Both need native Android permissions (`SYSTEM_ALERT_WINDOW`, `MediaProjection`) that a PWA cannot request. Capture is reached through the share sheet, or by uploading a screenshot yourself
- **No automated test suite in the repo** — testing has been script-driven against a live API
- **Premium tier is a pricing preview.** Nothing is charged; WhatsApp reminders and push are on the roadmap
- **Single-user deployment.** Designed to run locally or on one small server; no multi-tenant scaling work has been done

---

## Hackathon submission

**AI Seekho Builders Day 2026**

| | |
|---|---|
| 🌐 **Deployed link** | `<!-- TODO: add deployed URL -->` |
| 🎥 **Demo video** | `<!-- TODO: add demo video link -->` |
| 📊 **Presentation** | `<!-- TODO: add slide deck link -->` |
| 💻 **Repository** | `<!-- TODO: add public repo URL -->` |

### Team

| Name | Role | GitHub |
|---|---|---|
| `<!-- TODO -->` | `<!-- TODO -->` | `<!-- TODO -->` |
| `<!-- TODO -->` | `<!-- TODO -->` | `<!-- TODO -->` |

---

## License

`<!-- TODO: choose a license — MIT is the usual pick for hackathon submissions -->`

# Mauqa — Demo Runbook

**One sentence:** *Mauqa turns things you discover into actions before they expire.*

Target runtime: **3–4 minutes.** Everything below has been executed end-to-end against live Gemini 3.5 Flash via OpenRouter.

---

## 0. Before you start (2 minutes)

```powershell
cd C:\Users\prime\Desktop\reminder
npm run dev          # API :4200 + web :5183
```

Pre-flight checklist:

| Check | How | Expected |
|---|---|---|
| AI is live | `curl http://localhost:4200/api/status` | `"aiMode":"live"`, `"provider":"openrouter"`, `"reason":"verified"` |
| Logged in | Open http://localhost:5183 | Today screen, not the sign-in wizard |
| Some history exists | Today screen | **Needs your attention** shows 1–3 rows |
| Browser width | Demo at **390 px** (mobile) or 1440 px | Bottom nav visible at 390 px |

> If `aiMode` is `mock`, the demo still works — extraction falls back to the local regex engine and the trust badge will read **Unverified**. Say so out loud rather than hiding it; honesty about AI limits is part of the pitch.

---

## 1. Primary demo input

Paste this into **Capture**. It is deliberately realistic: two dates, eligibility mixed with documents, and a real application domain.

```
HEC Overseas Scholarship 2026 — Fully Funded PhD

The Higher Education Commission of Pakistan is inviting applications
for its Overseas Scholarship Programme.

Last date to apply: 30 November 2026
Programme begins: 15 January 2027

Eligibility: CGPA 3.0 or above, Pakistani nationals only, maximum age 40.
Documents required: attested transcripts, updated CV, two reference
letters, IELTS score report.

Benefits: full tuition, monthly stipend, return airfare.
Apply: https://scholarships.hec.gov.pk/overseas-phase3
```

### Expected output shape

Do **not** memorise exact strings — the model generates these live. Expect this *shape*:

| Field | Expected |
|---|---|
| Category | `scholarship` 🎓 |
| Organization | Higher Education Commission (or similar) |
| Deadline | **2026-11-30** |
| Event date | **2027-01-15** — visually separate from the deadline |
| Eligibility | ~3 criteria (CGPA, nationality, age) |
| Required documents | ~4 items (transcripts, CV, references, IELTS) |
| Apply link | the `scholarships.hec.gov.pk` URL, unchanged |
| Trust badge | **Verified ✓** or **Partially verified** |
| Next action | *Prepare attested transcripts* (or the first document) |

---

## 2. Exact clicks

| # | Click | Screen state to point at |
|---|---|---|
| 1 | Open Mauqa → land on **Today** | *"Needs your attention"* at the top — each row is an **action**, not a title. Say: *"Mauqa doesn't show me a list of things I saved. It shows me what to do next."* |
| 2 | Tap **Capture** (bottom bar ⚡ / sidebar) | Header reads **Add to Mauqa**. Three affordances: Paste a link · Upload screenshot · Paste text |
| 3 | Paste the block above | A **Detected: text** chip appears — auto-detection, no tab to choose |
| 4 | Tap **✨ Extract details** | Four honest stages: Understanding content → Extracting opportunity → Checking important details → Preparing your action card |
| 5 | Wait ~4–9 s | **Review what we found** with a trust badge at the top |
| 6 | Scroll the review | Point at: **deadline vs event date** separated · **eligibility vs required documents** separated · apply link with its honest source note · per-field confidence badges |
| 7 | Tap **✓ Save & Track** | Toast confirms; you land back on Today |
| 8 | Tap **Opportunities** | The new card appears — title, org, trust, countdown, documents progress, next action, CTA |
| 9 | Tap the card title | **Opportunity detail** — the action workspace |
| 10 | Tick one document in the checklist | Progress bar moves; **next action updates live** to the following document |
| 11 | Tap **Today** | The opportunity now appears under *Needs your attention* with its next action |

### The line that lands

At step 9, point at the two date blocks:

> *"Applications close 30 November. The programme starts 15 January. Most apps would store one date and get it wrong. Mauqa keeps them separate — because the deadline is what can kill your chance, and the start date is what you plan your life around."*

---

## 3. Verified before the sprint ended

| Flow | Result |
|---|---|
| Scholarship with eligibility + documents | ✅ 4 documents, 3 eligibility criteria, cleanly separated |
| Internship with application deadline | ✅ correct category + deadline |
| Certification | ✅ `certification` |
| Course with enrollment deadline + event date | ✅ deadline 2026-09-10, event 2026-10-05 |
| Hackathon with registration + event date | ✅ deadline 2026-08-15, event 2026-08-20 (start of range) |
| No deadline stated | ✅ `null` → *"Deadline not confirmed"* |
| "link in bio" | ✅ `apply_link: null`, flagged, trust **Unverified** |
| No documents | ✅ documents section hides |
| Ordinary task + reminders | ✅ unchanged |
| Save → reminders → ICS | ✅ 3 reminders created, calendar export valid |

---

## 4. Fallback behaviour — rehearse these

**AI is slow (>10 s).** The processing panel keeps animating; the request times out at 20 s and retries once. Talk over it: *"It's reading the whole post and structuring nine fields."* Don't refresh.

**AI fails entirely** (network, provider down, bad key). Extraction silently degrades to the local regex extractor. The result still appears, `extraction_mode` becomes `mock`, and the trust badge reads **Unverified** — the UI never claims AI verified anything. Say: *"No API key, no internet — it still works, it just tells you it's less sure."*

**No deadline detected.** The card shows **"Deadline not confirmed"** in warning colour, trust drops to **Needs review**, and the next action becomes *Review opportunity details*. This is a feature, not a bug — demonstrate it deliberately if you have time.

**Nothing on Today.** Empty state reads *"You're clear for now."* Capture one opportunity and it populates immediately.

**Backup input** if the primary paste behaves oddly:

```
NUST CodeFest registration closes August 15.
The hackathon takes place August 20–21 at NUST Islamabad.
Teams of 3–4. Register: https://nust.edu.pk/codefest
```

Shows the deadline/event split in one short block.

---

## 5. What NOT to claim on stage

- ❌ *"Mauqa verifies the official source."* It does **not** crawl or certify publishers. It reports whether a non-social origin exists and whether the critical fields came through cleanly. **Verified ✓** means *structured from a non-social source with high confidence* — nothing more.
- ❌ *"Reminders work when the app is closed."* Browser reminders need an open tab. The **📆 Add to phone calendar** export is what fires with Mauqa closed — demo that if asked.
- ❌ Don't promise WhatsApp, push notifications, or the Android app. They're roadmap.

Being precise here is a strength: the whole product thesis is that Mauqa is honest about what it knows.

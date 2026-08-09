// Seeds real, currently-open opportunities into an account so a demo has
// something to show without waiting on live extraction.
//
//   node tools/seed-demo.js --email=you@example.com
//   node tools/seed-demo.js --email=you@example.com --clear
//
// Idempotent: an opportunity whose title already exists for that user is
// skipped, so running it twice does not duplicate anything.
//
// These records are marked `extraction_mode: 'manual'` — they were researched
// and entered, not produced by the extractor. Confidence and needs_review below
// reflect how well each field is actually established, which is the same signal
// a live capture would carry. Nothing here is invented to look better than it is.

import { db } from '../server/db.js';
import { createOpportunity, replaceReminders, getOpportunity } from '../server/db.js';
import { DEFAULT_OFFSETS, computeReminders } from '../server/reminders.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

if (!args.email) {
  console.error('Usage: node tools/seed-demo.js --email=you@example.com [--clear]');
  process.exit(1);
}

const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(String(args.email).toLowerCase());
if (!user) {
  console.error(`No account found for ${args.email}.`);
  console.error('Accounts on this server:');
  for (const u of db.prepare('SELECT email FROM users').all()) console.error(`  ${u.email}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Sources checked on 9 August 2026. Deadlines move — re-verify before a demo.
//
// verified: read off the organiser's own page or site search.
// reported: taken from an aggregator summary and NOT confirmed at the source,
//           so the record carries the same needs_review flags a shaky
//           extraction would. These are the ones that should show "Needs
//           review" in the UI, and that is correct, not a defect.
// ---------------------------------------------------------------------------
const SEED = [
  {
    title: 'UNESCO Youth Hackathon 2026',
    organization: 'UNESCO',
    category: 'hackathon',
    deadline: '2026-08-16',
    deadline_time: '23:59',
    event_date: '2026-11-26',
    apply_link: 'https://tally.so/r/MePkYk',
    source_url: 'https://www.unesco.org/en/articles/unesco-youth-hackathon-2026',
    location: 'Thessaloniki, Greece (winners ceremony)',
    compensation: 'Flights, accommodation and meals covered for 2 members of each winning team',
    eligibility: [
      'Aged 18–30',
      'Teams of 2–6 members',
      'All team members must be 18–30',
      'National, regional or international teams welcome',
    ],
    requirements: [
      'Proposal document (PDF or Word, max 10 MB)',
      'Pitch video, maximum 3 minutes',
    ],
    summary: 'UNESCO youth hackathon. Submissions close 23:59 Paris time; the event and winners ceremony run 26–28 November in Thessaloniki.',
    tags: ['hackathon', 'unesco', 'youth', 'funded'],
    confidence: { title: 'high', organization: 'high', deadline: 'high', apply_link: 'high' },
    needs_review: [],
  },
  {
    title: 'Chevening Scholarship 2027/28',
    organization: 'UK Government (FCDO)',
    category: 'scholarship',
    deadline: '2026-10-06',
    deadline_time: '11:00',
    event_date: null,
    apply_link: 'https://www.chevening.org/apply/',
    source_url: 'https://www.chevening.org/scholarships/application-timeline/',
    location: 'United Kingdom',
    compensation: 'Fully funded one-year UK master’s: tuition, stipend, flights',
    eligibility: [
      'Citizen of a Chevening-eligible country (Pakistan qualifies)',
      'At least two years’ work experience after your undergraduate degree (≈2,800 hours)',
      'Undergraduate degree qualifying you for a UK master’s',
      'Commit to returning home for at least two years after the scholarship',
    ],
    requirements: [
      'Three UK university course choices',
      'Four essays (leadership, networking, studying in the UK, career plan)',
      'Two references',
      'Undergraduate transcripts',
      'Valid passport or national ID',
    ],
    summary: 'Fully funded UK master’s scholarship. Applications for 2027/28 close 6 October 2026 at 11:00 UTC.',
    tags: ['scholarship', 'uk', 'masters', 'fully-funded'],
    confidence: { title: 'high', organization: 'high', deadline: 'high', apply_link: 'high' },
    needs_review: [],
  },
  {
    title: 'Gates Cambridge Scholarship 2027',
    organization: 'University of Cambridge',
    category: 'scholarship',
    // Cambridge sets this per course, so the exact day is genuinely uncertain.
    deadline: '2026-12-03',
    deadline_time: null,
    event_date: null,
    apply_link: 'https://www.gatescambridge.org/apply/',
    source_url: 'https://www.gatescambridge.org/apply/',
    location: 'Cambridge, United Kingdom',
    compensation: 'Full cost of studying at Cambridge plus maintenance allowance',
    eligibility: [
      'Citizen of any country outside the UK',
      'Applying for a full-time postgraduate degree at Cambridge',
    ],
    requirements: [
      'Cambridge graduate application',
      'Gates Cambridge reference',
      'Research proposal (for PhD applicants)',
    ],
    summary: 'Full postgraduate funding at Cambridge. The deadline depends on your course — confirm the exact date on the course page.',
    tags: ['scholarship', 'uk', 'postgraduate', 'fully-funded'],
    confidence: { title: 'high', organization: 'high', deadline: 'low', apply_link: 'medium' },
    needs_review: ['deadline'],
  },
  {
    title: 'University of Saskatchewan Graduate Awards',
    organization: 'University of Saskatchewan',
    category: 'scholarship',
    deadline: '2026-12-01',
    deadline_time: null,
    event_date: null,
    apply_link: null,
    source_url: null,
    location: 'Saskatoon, Canada',
    compensation: null,
    eligibility: ['Applying to a graduate programme at the University of Saskatchewan'],
    requirements: [],
    summary: 'Graduate award deadline reported as 1 December 2026. Confirm on the university’s own funding page before relying on it.',
    tags: ['scholarship', 'canada', 'graduate'],
    confidence: { title: 'medium', organization: 'high', deadline: 'low', apply_link: 'low' },
    needs_review: ['deadline', 'apply_link', 'compensation'],
  },
  {
    title: 'Chinese Government Scholarship (CSC) 2027/28',
    organization: 'China Scholarship Council',
    category: 'scholarship',
    // The window opens in December; the closing date is set per university.
    deadline: null,
    deadline_time: null,
    event_date: '2026-12-15',
    apply_link: null,
    source_url: null,
    location: 'China',
    compensation: 'Tuition, accommodation and monthly stipend',
    eligibility: ['Non-Chinese national', 'Meets the age and degree limits for the level applied to'],
    requirements: [],
    summary: 'Applications reported to open around 15 December 2026 for the 2027–28 intake. The closing date is set by each host university and is not yet confirmed.',
    tags: ['scholarship', 'china', 'fully-funded'],
    confidence: { title: 'medium', organization: 'high', deadline: 'low', apply_link: 'low' },
    needs_review: ['deadline', 'apply_link'],
  },
];

if (args.clear) {
  const titles = SEED.map((s) => s.title);
  const q = `SELECT id FROM opportunities WHERE user_id = ? AND title IN (${titles.map(() => '?').join(',')})`;
  const rows = db.prepare(q).all(user.id, ...titles);
  for (const r of rows) {
    db.prepare('DELETE FROM reminders WHERE opportunity_id = ?').run(r.id);
    db.prepare('DELETE FROM opportunities WHERE id = ?').run(r.id);
  }
  console.log(`Removed ${rows.length} previously seeded item(s) for ${user.email}.`);
}

let added = 0;
let skipped = 0;

for (const s of SEED) {
  const exists = db.prepare('SELECT id FROM opportunities WHERE user_id = ? AND title = ?').get(user.id, s.title);
  if (exists) {
    console.log(`  skip   ${s.title} (already there, id ${exists.id})`);
    skipped++;
    continue;
  }

  const offsets = DEFAULT_OFFSETS.opportunity;
  const id = createOpportunity(user.id, {
    ...s,
    item_type: 'opportunity',
    status: 'pending',
    priority: 'normal',
    recurrence: 'none',
    source_type: s.source_url ? 'link' : 'manual',
    source_platform: s.source_url ? new URL(s.source_url).hostname.replace(/^www\./, '') : 'manual',
    extraction_mode: 'manual',
    requirements_done: [],
    reminder_offsets: offsets,
  });

  const reminders = computeReminders(s.deadline, s.deadline_time, offsets, []);
  replaceReminders(id, reminders);

  const saved = getOpportunity(id, user.id);
  console.log(`  added  ${s.title}`);
  console.log(`           deadline=${saved.deadline ?? '—'}${saved.deadline_time ? ' ' + saved.deadline_time : ''}  event=${saved.event_date ?? '—'}  reminders=${saved.reminders.length}  docs=${saved.requirements.length}  elig=${saved.eligibility.length}`);
  added++;
}

console.log(`\nDone for ${user.name} <${user.email}> — ${added} added, ${skipped} skipped.`);
console.log('Deadlines were checked on 9 August 2026. Re-verify anything you plan to show live.');

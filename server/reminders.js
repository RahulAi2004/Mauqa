// Reminder scheduling. Extracted from index.js so anything that writes an
// opportunity — the API, the recurrence roll-over, the demo seeder — produces
// exactly the same rows. Duplicating this logic is how seeded data ends up with
// reminders that differ from the ones a real save would have created.

import { isValidTime } from './time.js';

// Offsets are MINUTES before the deadline moment (deadline_time, else 09:00).
export const DEFAULT_OFFSETS = {
  meeting: [1440, 60, 15],
  test: [10080, 4320, 1440],
  assignment: [4320, 1440, 60],
  bill: [4320, 1440],
  task: [1440, 60],
  event: [1440, 60],
  opportunity: [10080, 4320, 1440, 0],
  other: [1440],
};

export function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export const todayLocal = () => localIso(new Date()).slice(0, 10);

export function offsetLabel(minutes) {
  if (minutes === 0) return 'It’s time!';
  if (minutes < 60) return `${minutes} min to go`;
  if (minutes < 1440) { const h = Math.round(minutes / 60); return `${h} hour${h > 1 ? 's' : ''} to go`; }
  const d = Math.round(minutes / 1440);
  return `${d} day${d > 1 ? 's' : ''} left`;
}

export function computeReminders(deadline, deadline_time, offsets = [], custom = []) {
  const out = [];
  if (deadline) {
    // Last line of defence: anything not strictly HH:mm (including legacy rows
    // written before normalisation existed) falls back to 09:00 rather than
    // producing an Invalid Date and silently generating zero reminders.
    const at = isValidTime(deadline_time) ? deadline_time : '09:00';
    const base = new Date(`${deadline}T${at}:00`);
    for (const mins of offsets) {
      const d = new Date(base.getTime() - mins * 60000);
      if (d.getTime() > Date.now()) out.push({ remind_at: localIso(d), label: offsetLabel(mins) });
    }
  }
  for (const iso of custom) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
      out.push({ remind_at: localIso(d), label: 'Custom reminder' });
    }
  }
  return out;
}

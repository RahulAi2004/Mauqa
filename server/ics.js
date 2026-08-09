// Build a .ics calendar file for an item so phone-native reminders work even
// when the app is closed. Timed items (meetings) become timed events; date-only
// items become all-day events. Alarms mirror the item's reminder offsets.

import { isValidTime } from './time.js';

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

const p = (n) => String(n).padStart(2, '0');
const compactDate = (d) => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
const compactDateTime = (d) => `${compactDate(d)}T${p(d.getHours())}${p(d.getMinutes())}00`;

function alarmTrigger(minutes) {
  if (minutes === 0) return 'PT0M';
  if (minutes % 1440 === 0) return `-P${minutes / 1440}D`;
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

function alarmLabel(minutes) {
  if (minutes === 0) return 'now!';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 1440) return `in ${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)} day(s) left`;
}

export function buildIcs(opp) {
  if (!opp.deadline) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const offsets = opp.reminder_offsets?.length ? opp.reminder_offsets : [1440];

  let dtLines;
  // Only a strict HH:mm value may become a timed event; anything else (legacy
  // free-form text) degrades to an all-day event instead of an invalid DTSTART.
  if (isValidTime(opp.deadline_time)) {
    const start = new Date(`${opp.deadline}T${opp.deadline_time}:00`);
    const end = new Date(start.getTime() + 60 * 60000);
    dtLines = [`DTSTART:${compactDateTime(start)}`, `DTEND:${compactDateTime(end)}`];
  } else {
    const start = new Date(`${opp.deadline}T00:00:00`);
    const next = new Date(start); next.setDate(next.getDate() + 1);
    dtLines = [`DTSTART;VALUE=DATE:${compactDate(start)}`, `DTEND;VALUE=DATE:${compactDate(next)}`];
  }

  const alarms = offsets.map((mins) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`${opp.title} — ${alarmLabel(mins)}`)}`,
    `TRIGGER:${alarmTrigger(mins)}`,
    'END:VALARM',
  ].join('\r\n')).join('\r\n');

  const rrule = { daily: 'RRULE:FREQ=DAILY', weekly: 'RRULE:FREQ=WEEKLY', monthly: 'RRULE:FREQ=MONTHLY' }[opp.recurrence] || null;

  const description = [
    opp.organization && `With/at: ${opp.organization}`,
    opp.apply_link && `Link: ${opp.apply_link}`,
    opp.location && `Location: ${opp.location}`,
    opp.summary,
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mauqa//Reminder Inbox//EN',
    'BEGIN:VEVENT',
    `UID:mauqa-${opp.id}@mauqa.app`,
    `DTSTAMP:${stamp}`,
    ...dtLines,
    rrule,
    `SUMMARY:${icsEscape(opp.title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    opp.apply_link ? `URL:${icsEscape(opp.apply_link)}` : null,
    alarms,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

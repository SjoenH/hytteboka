// A booking as a file that Outlook, Google Calendar, Apple's Calendar and the like can read:
// iCalendar (RFC 5545), with one event in it.
//
// The event is the stay as `weeks.js` has it: from when those who have the week may come
// (`startsAt`) to when they are out (`endsAt`). Both are written as moments in UTC, so a calendar
// puts them right on the clock in Norway without having to be told what time zone Norway is in.
//
// The file is a copy of the booking, taken when someone asks for it. Nothing here can reach into
// a calendar afterwards: a week that is given up stays in the calendar until its owner removes it.

import { createHash } from 'node:crypto';
import { endsAt, RULE_IN_WORDS, startsAt, weekNumber } from './weeks.js';

export const CALENDAR_TYPE = 'text/calendar; charset=utf-8';

/** What the file is called where it is saved: "hytta-2026-uke-45.ics". */
export function calendarFileName(week) {
  return `hytta-${week.slice(0, 4)}-uke-${weekNumber(week)}.ics`;
}

/** The file for one booking: `booking` is what stands in the book for `week`, { name, at }. */
export function calendarFile({ week, booking }) {
  const about = [
    `${booking.name} har firmahytta denne uka.`,
    RULE_IN_WORDS,
    'Hentet fra Hytteboka. Sier du fra deg uka der, må du slette denne avtalen selv.',
  ].join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Miles//Hytteboka//NB',
    'BEGIN:VEVENT',
    `UID:${uidOf(week, booking)}`,
    // When the booking was made, not when the file was asked for: the same booking gives the same file.
    `DTSTAMP:${moment(new Date(booking.at))}`,
    `DTSTART:${moment(startsAt(week))}`,
    `DTEND:${moment(endsAt(week))}`,
    `SUMMARY:${text(`Firmahytta, uke ${weekNumber(week)}`)}`,
    `DESCRIPTION:${text(about)}`,
    // Having the cabin is not being away from work: the week does not mark its owner as busy.
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map((line) => `${fold(line)}\r\n`).join('');
}

/**
 * What a calendar knows the event by. It is the same every time the same booking is fetched, so
 * fetching it twice gives one event in a calendar that goes by this, and a week that is given up
 * and booked again is another event.
 */
function uidOf(week, booking) {
  const mark = createHash('sha256').update(`${week}\n${booking.name}\n${booking.at}`).digest('hex');
  return `${week}-${mark.slice(0, 24)}@hytteboka`;
}

/** "20261031T110000Z" */
function moment(date) {
  return date.toISOString().replace(/[-:]|\.\d+/g, '');
}

/** Words as the format wants them, so that a comma or a semicolon in a name stays part of the name. */
function text(words) {
  return words
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * A line is at most 75 bytes; what is over goes on the lines after it, each started with a space.
 * It is broken between characters, never inside one: æ, ø and å are two bytes each.
 */
function fold(line) {
  const parts = [''];
  let room = 75;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (size > room) {
      parts.push('');
      room = 74;
    }
    parts[parts.length - 1] += character;
    room -= size;
  }
  return parts.join('\r\n ');
}

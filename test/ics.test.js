// The file a booking is handed out as, read here the way the format (RFC 5545) says a calendar reads it.
// No calendar program is run by these tests.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarFile, calendarFileName } from '../src/ics.js';

const AUTUMN = '2026-W45';
const OLA = { name: 'Ola Nordmann', at: '2026-10-14T10:00:00.000Z' };

/** The lines of a file, each as [name, value], with lines that were broken put together again. */
function read(file) {
  return file
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter((line) => line !== '')
    .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)]);
}

/** The words of a value, with what was written for the format's sake taken out again. */
function words(value) {
  return value.replace(/\\([\\;,nN])/g, (_, mark) => (mark === 'n' || mark === 'N' ? '\n' : mark));
}

const eventOf = (week, booking) => Object.fromEntries(read(calendarFile({ week, booking })));

test('the file is one calendar with one event in it, and every line ends as the format says', () => {
  const file = calendarFile({ week: AUTUMN, booking: OLA });
  const names = read(file).map(([name]) => name);

  assert.deepEqual(names, [
    'BEGIN', 'VERSION', 'PRODID', 'BEGIN', 'UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION',
    'TRANSP', 'END', 'END',
  ]);
  assert.deepEqual(read(file).filter(([name]) => name === 'BEGIN' || name === 'END'), [
    ['BEGIN', 'VCALENDAR'], ['BEGIN', 'VEVENT'], ['END', 'VEVENT'], ['END', 'VCALENDAR'],
  ]);
  assert.equal(eventOf(AUTUMN, OLA).VERSION, '2.0');
  assert.ok(file.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(file.replaceAll('\r\n', ''), /[\r\n]/, 'no line ends any other way');
});

test('the event runs from twelve on the Saturday the week starts to twelve on the Saturday it ends', () => {
  // 31 October to 7 November 2026, winter time: twelve in Norway is 11:00 UTC.
  const event = eventOf(AUTUMN, OLA);
  assert.equal(event.DTSTART, '20261031T110000Z');
  assert.equal(event.DTEND, '20261107T110000Z');
});

test('twelve is twelve in Norway in summer time too, and in a week the clock is set in', () => {
  assert.equal(eventOf('2027-W28', OLA).DTSTART, '20270710T100000Z');
  assert.equal(eventOf('2027-W28', OLA).DTEND, '20270717T100000Z');
  // The clock is set back on 25 October 2026.
  assert.equal(eventOf('2026-W44', OLA).DTSTART, '20261024T100000Z');
  assert.equal(eventOf('2026-W44', OLA).DTEND, '20261031T110000Z');
});

test('the event says what it is, who has the cabin, and when those who leave are out', () => {
  const event = eventOf(AUTUMN, OLA);
  assert.equal(words(event.SUMMARY), 'Firmahytta, uke 45');
  assert.equal(
    words(event.DESCRIPTION),
    'Ola Nordmann har firmahytta denne uka.\n\n'
      + 'Hytteuka går fra lørdag til lørdag. De som reiser, er ute til klokka 12.\n\n'
      + 'Hentet fra Hytteboka. Sier du fra deg uka der, må du slette denne avtalen selv.',
  );
});

test('the event does not mark the one who has the cabin as busy', () => {
  assert.equal(eventOf(AUTUMN, OLA).TRANSP, 'TRANSPARENT');
});

test('the same booking is the same file every time, and known to a calendar by the same mark', () => {
  assert.equal(calendarFile({ week: AUTUMN, booking: OLA }), calendarFile({ week: AUTUMN, booking: { ...OLA } }));
  assert.equal(eventOf(AUTUMN, OLA).DTSTAMP, '20261014T100000Z', 'stamped when the booking was made');
  assert.match(eventOf(AUTUMN, OLA).UID, /^2026-W45-[0-9a-f]{24}@hytteboka$/);
});

test('another booking is another event: another week, another person, or the same person booking again', () => {
  const marks = [
    eventOf(AUTUMN, OLA).UID,
    eventOf('2026-W46', OLA).UID,
    eventOf(AUTUMN, { ...OLA, name: 'Kari Hansen' }).UID,
    eventOf(AUTUMN, { ...OLA, at: '2026-10-15T07:30:00.000Z' }).UID,
  ];
  assert.equal(new Set(marks).size, 4);
});

test('a name with a comma, a semicolon or a backslash in it stays one name', () => {
  const name = 'Hansen, Kari; "IT\\drift"';
  const file = calendarFile({ week: AUTUMN, booking: { ...OLA, name } });
  const event = Object.fromEntries(read(file));

  assert.match(file.replace(/\r\n /g, ''), /DESCRIPTION:Hansen\\, Kari\\; "IT\\\\drift" har firmahytta/);
  assert.ok(words(event.DESCRIPTION).startsWith(`${name} har firmahytta denne uka.`));
});

test('a name cannot start a line of its own in the file', () => {
  // A name never has a line break in it when it comes through the page; this is a book changed by hand.
  const file = calendarFile({ week: AUTUMN, booking: { ...OLA, name: 'Ola\r\nDTSTART:19990101T000000Z' } });
  const event = read(file);

  assert.equal(event.filter(([name]) => name === 'DTSTART').length, 1);
  assert.equal(Object.fromEntries(event).DTSTART, '20261031T110000Z');
});

test('no line is longer than 75 bytes, and none is broken inside a letter', () => {
  const name = 'Åse Østbø Ærø '.repeat(4).trim() + ' 🏔️';
  const file = calendarFile({ week: AUTUMN, booking: { ...OLA, name } });

  // Read as the bytes a calendar is sent: each line alone must be whole text.
  const bytes = Buffer.from(file, 'utf8');
  const whole = new TextDecoder('utf-8', { fatal: true });
  let broken = 0;
  for (let from = 0; from < bytes.length;) {
    const to = bytes.indexOf('\r\n', from);
    const line = bytes.subarray(from, to);
    assert.ok(line.length <= 75, `${line.length} bytes: ${line}`);
    assert.doesNotThrow(() => whole.decode(line), `broken inside a letter: ${line}`);
    if (line[0] === 0x20) broken += 1;
    from = to + 2;
  }
  assert.ok(broken >= 2, 'the long line was broken');
  assert.ok(words(Object.fromEntries(read(file)).DESCRIPTION).startsWith(`${name} har firmahytta denne uka.`));
});

test('the file is named after the week', () => {
  assert.equal(calendarFileName(AUTUMN), 'hytta-2026-uke-45.ics');
  assert.equal(calendarFileName('2027-W08'), 'hytta-2027-uke-8.ics');
});

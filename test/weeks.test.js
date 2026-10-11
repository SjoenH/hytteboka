import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addWeeks, currentWeek, easterSunday, easterWeek, endOf, formatMoment, formatRange, isWeekId, monthOf, startOf,
  weekNumber, weeksFrom,
} from '../src/weeks.js';

const SATURDAY = 6;
const iso = (date) => date.toISOString().slice(0, 10);

test('a week runs from a Saturday to the next Saturday', () => {
  assert.equal(iso(startOf('2026-W42')), '2026-10-10');
  assert.equal(iso(endOf('2026-W42')), '2026-10-17');

  for (const week of weeksFrom('2026-W40', 120)) {
    assert.equal(startOf(week).getUTCDay(), SATURDAY, `${week} starts on a Saturday`);
    assert.equal(endOf(week).getUTCDay(), SATURDAY, `${week} ends on a Saturday`);
    assert.equal(iso(endOf(week)), iso(startOf(addWeeks(week, 1))), `${week} ends the day the next one starts`);
  }
});

test('a week is named after the working week inside it, and starts the Saturday before', () => {
  // Week 8 of 2027 in the calendar is Monday 22 to Sunday 28 February.
  assert.equal(iso(startOf('2027-W08')), '2027-02-20');
  assert.equal(iso(endOf('2027-W08')), '2027-02-27');
  // Week 12 is Monday 22 to Sunday 28 March.
  assert.equal(iso(startOf('2027-W12')), '2027-03-20');
  assert.equal(iso(endOf('2027-W12')), '2027-03-27');
});

test('a week around New Year starts in the old year', () => {
  assert.equal(iso(startOf('2026-W53')), '2026-12-26');
  assert.equal(iso(endOf('2026-W53')), '2027-01-02');
  assert.equal(iso(startOf('2027-W01')), '2027-01-02');
  assert.equal(iso(startOf('2026-W01')), '2025-12-27');
});

test('the week changes on Saturday at twelve, Norwegian time', () => {
  // Summer time: twelve in Norway is 10:00 UTC.
  assert.equal(currentWeek(new Date('2026-10-10T09:59:59Z')), '2026-W41');
  assert.equal(currentWeek(new Date('2026-10-10T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-17T09:59:59Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-17T10:00:00Z')), '2026-W43');
});

test('the week does not change at any other time', () => {
  // Saturday evening, the night to Monday, and the last minute before Saturday: all in the week of 10 to 17 October.
  assert.equal(currentWeek(new Date('2026-10-10T21:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-11T21:59:59Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-11T22:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-14T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-16T21:59:59Z')), '2026-W42');
});

test('twelve is twelve on the clock in Norway, in winter time too', () => {
  // The clock was set back on 25 October 2026: twelve is now 11:00 UTC.
  assert.equal(currentWeek(new Date('2026-10-31T10:59:59Z')), '2026-W44');
  assert.equal(currentWeek(new Date('2026-10-31T11:00:00Z')), '2026-W45');
  // The Saturday the first week of 2027 starts on.
  assert.equal(currentWeek(new Date('2027-01-02T10:59:59Z')), '2026-W53');
  assert.equal(currentWeek(new Date('2027-01-02T11:00:00Z')), '2027-W01');
});

test('only weeks that exist are weeks', () => {
  assert.equal(isWeekId('2026-W53'), true);
  assert.equal(isWeekId('2027-W53'), false, '2027 has 52 weeks');
  assert.equal(isWeekId('2027-W00'), false);
  assert.equal(isWeekId('2027-W1'), false);
  assert.equal(isWeekId('uke 12'), false);
  assert.equal(isWeekId(undefined), false);
  assert.equal(startOf('2027-W53'), null);
  assert.equal(endOf('uke 12'), null);
});

test('weeks are counted across New Year', () => {
  assert.equal(addWeeks('2026-W52', 2), '2027-W01');
  assert.deepEqual(weeksFrom('2026-W52', 3), ['2026-W52', '2026-W53', '2027-W01']);
  assert.equal(weekNumber('2027-W08'), 8);
});

test('weeks sort as text', () => {
  const weeks = weeksFrom('2026-W40', 70);
  assert.deepEqual([...weeks].sort(), weeks);
});

test('Easter Sunday falls where the almanac says', () => {
  assert.equal(iso(easterSunday(2025)), '2025-04-20');
  assert.equal(iso(easterSunday(2026)), '2026-04-05');
  assert.equal(iso(easterSunday(2027)), '2027-03-28');
  assert.equal(iso(easterSunday(2028)), '2028-04-16');
  assert.equal(iso(easterSunday(2038)), '2038-04-25');
});

test('the week of Easter has Maundy Thursday and Good Friday in it, and ends on Easter Saturday', () => {
  assert.equal(easterWeek(2027), '2027-W12');
  assert.equal(iso(startOf(easterWeek(2027))), '2027-03-20', 'the Saturday before Palm Sunday');
  assert.equal(iso(endOf(easterWeek(2027))), '2027-03-27', 'the day before Easter Sunday');

  assert.equal(easterWeek(2026), '2026-W14');
  assert.equal(iso(endOf(easterWeek(2026))), '2026-04-04');
});

test('a week is written with the two Saturdays it runs between', () => {
  assert.equal(formatRange('2027-W12'), 'lør. 20. – lør. 27. mars 2027');
  assert.equal(formatRange('2027-W13'), 'lør. 27. mars – lør. 3. april 2027');
  assert.equal(formatRange('2026-W53'), 'lør. 26. desember 2026 – lør. 2. januar 2027');
  assert.equal(formatRange('2027-W12', { year: false }), 'lør. 20. – lør. 27. mars');
  assert.equal(formatRange('2026-W53', { year: false }), 'lør. 26. desember – lør. 2. januar');
});

test('a week is listed under the month most of its nights fall in', () => {
  assert.equal(monthOf('2027-W12'), 'Mars 2027');
  assert.equal(monthOf('2027-W13'), 'Mars 2027', 'five nights in March, two in April');
  assert.equal(monthOf('2027-W14'), 'April 2027');
  assert.equal(monthOf('2026-W49'), 'Desember 2026', 'three nights in November, four in December');
  assert.equal(monthOf('2026-W53'), 'Desember 2026');
});

test('a moment is written in Norwegian time', () => {
  const text = formatMoment('2026-10-11T13:42:00.000Z');
  assert.match(text, /11\. oktober 2026/);
  assert.match(text, /15[:.]42/);
});

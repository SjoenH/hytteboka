import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addWeeks, ARRIVAL_HOUR, CHANGEOVER_HOUR, currentWeek, easterSunday, easterTrip, easterWeek, endOf, endsAt, formatMoment,
  formatRange, isWeekId, monthOf, RULE_IN_WORDS, startOf, startsAt, weekNumber, weeksFrom, yearOf,
} from '../src/weeks.js';

const FRIDAY = 5;
const HOUR = 3_600_000;
const iso = (date) => date.toISOString().slice(0, 10);

test('a week runs from a Friday to the next Friday', () => {
  assert.equal(iso(startOf('2026-W42')), '2026-10-09');
  assert.equal(iso(endOf('2026-W42')), '2026-10-16');

  for (const week of weeksFrom('2026-W40', 120)) {
    assert.equal(startOf(week).getUTCDay(), FRIDAY, `${week} starts on a Friday`);
    assert.equal(endOf(week).getUTCDay(), FRIDAY, `${week} ends on a Friday`);
    assert.equal(iso(endOf(week)), iso(startOf(addWeeks(week, 1))), `${week} ends the day the next one starts`);
  }
});

test('a week is named after the working week inside it, and starts the Friday before', () => {
  // Week 8 of 2027 in the calendar is Monday 22 to Sunday 28 February.
  assert.equal(iso(startOf('2027-W08')), '2027-02-19');
  assert.equal(iso(endOf('2027-W08')), '2027-02-26');
  // Week 12 is Monday 22 to Sunday 28 March.
  assert.equal(iso(startOf('2027-W12')), '2027-03-19');
  assert.equal(iso(endOf('2027-W12')), '2027-03-26');
});

test('a week around New Year starts in the old year', () => {
  assert.equal(iso(startOf('2026-W53')), '2026-12-25');
  assert.equal(iso(endOf('2026-W53')), '2027-01-01');
  assert.equal(iso(startOf('2027-W01')), '2027-01-01');
  assert.equal(iso(startOf('2026-W01')), '2025-12-26');
});

test('the week changes on Friday at twelve, Norwegian time', () => {
  // Summer time: twelve in Norway is 10:00 UTC.
  assert.equal(currentWeek(new Date('2026-10-09T09:59:59Z')), '2026-W41');
  assert.equal(currentWeek(new Date('2026-10-09T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-16T09:59:59Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-16T10:00:00Z')), '2026-W43');
});

test('the week does not change at any other time', () => {
  // Friday evening, Saturday at twelve where the change was first put, the night to Monday,
  // and the last minute of Thursday: all in the week of 9 to 16 October.
  assert.equal(currentWeek(new Date('2026-10-09T21:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-10T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-11T21:59:59Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-11T22:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-14T10:00:00Z')), '2026-W42');
  assert.equal(currentWeek(new Date('2026-10-15T21:59:59Z')), '2026-W42');
});

test('twelve is twelve on the clock in Norway, in winter time too', () => {
  // The clock was set back on 25 October 2026: twelve is now 11:00 UTC.
  assert.equal(currentWeek(new Date('2026-10-30T10:59:59Z')), '2026-W44');
  assert.equal(currentWeek(new Date('2026-10-30T11:00:00Z')), '2026-W45');
  // The Friday the first week of 2027 starts on is New Year's Day.
  assert.equal(currentWeek(new Date('2027-01-01T10:59:59Z')), '2026-W53');
  assert.equal(currentWeek(new Date('2027-01-01T11:00:00Z')), '2027-W01');
});

test('those who have a week come after work on its first Friday, and are out at twelve on its last', () => {
  assert.equal(ARRIVAL_HOUR, 16);
  assert.equal(CHANGEOVER_HOUR, 12);
  // Summer time on both Fridays: Norway is two hours ahead of UTC.
  assert.equal(startsAt('2026-W42').toISOString(), '2026-10-09T14:00:00.000Z');
  assert.equal(endsAt('2026-W42').toISOString(), '2026-10-16T10:00:00.000Z');
  // The clock is set back on 25 October 2026, inside this week.
  assert.equal(startsAt('2026-W44').toISOString(), '2026-10-23T14:00:00.000Z');
  assert.equal(endsAt('2026-W44').toISOString(), '2026-10-30T11:00:00.000Z');
  // And forward on 28 March 2027, inside the week after Easter's.
  assert.equal(endsAt('2027-W12').toISOString(), '2027-03-26T11:00:00.000Z');
  assert.equal(startsAt('2027-W13').toISOString(), '2027-03-26T15:00:00.000Z');
  assert.equal(endsAt('2027-W13').toISOString(), '2027-04-02T10:00:00.000Z');

  assert.equal(startsAt('2027-W53'), null);
  assert.equal(endsAt('uke 12'), null);
});

test('a week becomes this week at twelve on its Friday, when those who leave are out', () => {
  for (const week of weeksFrom('2026-W40', 120)) {
    const out = endsAt(addWeeks(week, -1)).getTime();
    assert.equal(currentWeek(new Date(out)), week, `${week} at twelve`);
    assert.equal(currentWeek(new Date(out - 1)), addWeeks(week, -1), `${week} just before twelve`);
  }
});

test('between those who leave and those who come the cabin is the cleaner’s, the same Friday', () => {
  for (const week of weeksFrom('2026-W40', 120)) {
    const out = endsAt(addWeeks(week, -1));
    const come = startsAt(week);
    assert.equal(come.getTime() - out.getTime(), (ARRIVAL_HOUR - CHANGEOVER_HOUR) * HOUR, `${week}: four hours`);
    assert.equal(iso(startOf(week)), iso(out), `${week}: out on the Friday the week starts`);
    assert.ok(endsAt(week).getTime() > come.getTime());
  }
});

test('the rule is said in one sentence, with its reason', () => {
  assert.equal(
    RULE_IN_WORDS,
    'Hytteuka går fra fredag til fredag. De som reiser, er ute til klokka 12, så vaskehjelpen rekker over før de neste kommer etter jobb.',
  );
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

test('Easter is one trip of two weeks: from the Friday before Palm Sunday to the Friday after Easter Monday', () => {
  // 2027: Palm Sunday 21 March, Good Friday 26 March, Easter Sunday 28 March, Easter Monday 29 March.
  assert.deepEqual(easterTrip(2027), { week: '2027-W12', through: '2027-W13' });
  assert.equal(iso(startOf('2027-W12')), '2027-03-19', 'the Friday before Palm Sunday');
  assert.equal(iso(endOf('2027-W13')), '2027-04-02', 'the Friday after Easter Monday');
  assert.equal(iso(endOf('2027-W12')), '2027-03-26', 'Good Friday is in the middle of it, and no changeover');

  // 2026: Easter Sunday 5 April.
  assert.deepEqual(easterTrip(2026), { week: '2026-W14', through: '2026-W15' });
  assert.equal(iso(startOf('2026-W14')), '2026-03-27');
  assert.equal(iso(endOf('2026-W15')), '2026-04-10');

  for (let year = 2025; year <= 2040; year += 1) {
    const { week, through } = easterTrip(year);
    const easter = easterSunday(year).getTime();
    assert.equal(week, easterWeek(year));
    assert.equal(through, addWeeks(week, 1));
    assert.equal(easter - startOf(week).getTime(), 9 * 24 * HOUR, `${year}: it starts nine days before Easter Sunday`);
    assert.equal(endOf(through).getTime() - easter, 5 * 24 * HOUR, `${year}: and ends five days after`);
  }
});

test('those who have Easter come after work on its first Friday, and are out at twelve on its last', () => {
  const { week, through } = easterTrip(2027);
  // The clock is set forward on 28 March 2027, inside the trip.
  assert.equal(startsAt(week).toISOString(), '2027-03-19T15:00:00.000Z');
  assert.equal(endsAt(through).toISOString(), '2027-04-02T10:00:00.000Z');
});

test('a week is written with the two Fridays it runs between', () => {
  assert.equal(formatRange('2027-W12'), 'fre. 19. – fre. 26. mars 2027');
  assert.equal(formatRange('2027-W13'), 'fre. 26. mars – fre. 2. april 2027');
  assert.equal(formatRange('2026-W53'), 'fre. 25. desember 2026 – fre. 1. januar 2027');
  assert.equal(formatRange('2027-W12', { year: false }), 'fre. 19. – fre. 26. mars');
  assert.equal(formatRange('2026-W53', { year: false }), 'fre. 25. desember – fre. 1. januar');
});

test('a trip of two weeks is written with its first Friday and its last', () => {
  assert.equal(formatRange('2027-W12', { through: '2027-W13' }), 'fre. 19. mars – fre. 2. april 2027');
  assert.equal(formatRange('2027-W12', { through: '2027-W13', year: false }), 'fre. 19. mars – fre. 2. april');
  assert.equal(formatRange('2027-W12', { through: '2027-W12' }), formatRange('2027-W12'));
});

test('a week is listed under the month most of its nights fall in', () => {
  assert.equal(monthOf('2027-W12'), 'Mars 2027');
  assert.equal(monthOf('2027-W13'), 'Mars 2027', 'six nights in March, one in April');
  assert.equal(monthOf('2027-W14'), 'April 2027');
  assert.equal(monthOf('2026-W49'), 'November 2026', 'four nights in November, three in December');
  assert.equal(monthOf('2026-W50'), 'Desember 2026');
  assert.equal(monthOf('2026-W53'), 'Desember 2026');
});

test('a week counts for the year most of its nights fall in', () => {
  assert.equal(yearOf('2027-W08'), 2027);
  assert.equal(yearOf('2027-W12'), 2027);
  assert.equal(yearOf('2026-W53'), 2026, '25 December to 1 January: all seven nights in 2026');
  assert.equal(yearOf('2027-W01'), 2027, '1 to 8 January');
  assert.equal(yearOf('2026-W01'), 2025, '26 December 2025 to 2 January 2026: six nights in 2025');
  assert.equal(yearOf('2025-W01'), 2024, '27 December 2024 to 3 January 2025: five nights in 2024');
  assert.equal(yearOf('2024-W01'), 2024, '29 December 2023 to 5 January 2024: four nights in 2024');
});

test('a moment is written in Norwegian time', () => {
  const text = formatMoment('2026-10-11T13:42:00.000Z');
  assert.match(text, /11\. oktober 2026/);
  assert.match(text, /15[:.]42/);
});

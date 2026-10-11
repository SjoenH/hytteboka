// A week on the cabin runs from Saturday at twelve to the next Saturday at twelve, Norwegian time:
// those who leave are out by twelve. That is Ragnhild's rule. It is not a week of the calendar,
// which runs from Monday to Sunday.
//
// A week is named after the working week inside it. "2027-W12" has Monday to Friday of week 12
// in it: it starts on the Saturday before, 20 March 2027, and ends on Saturday 27 March.
// Written that way, weeks sort as text: "2026-W53" < "2027-W01".
//
// Every date here is a calendar day held as midnight UTC, so summer time never moves one.

/** The hour, on the clock in Norway, when one week ends on a Saturday and the next starts. */
export const CHANGEOVER_HOUR = 12;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK_ID = /^(\d{4})-W(\d{2})$/;

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const osloClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const osloMoment = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** The Saturday a week starts on, or null when the text names no week (as "2027-W53" does not). */
export function startOf(id) {
  const monday = mondayIn(id);
  return monday && new Date(monday.getTime() - 2 * DAY);
}

/** The Saturday a week ends on, which is the day the next one starts. */
export function endOf(id) {
  const start = startOf(id);
  return start && new Date(start.getTime() + 7 * DAY);
}

export function isWeekId(id) {
  return typeof id === 'string' && mondayIn(id) !== null;
}

export function weekNumber(id) {
  return Number(id.slice(-2));
}

export function addWeeks(id, count) {
  return calendarWeekOf(new Date(mondayIn(id).getTime() + count * 7 * DAY));
}

export function weeksFrom(id, count) {
  return Array.from({ length: count }, (_, index) => addWeeks(id, index));
}

/** The week it is on the cabin at this moment. */
export function currentWeek(now = new Date()) {
  const clock = Object.fromEntries(osloClock.formatToParts(now).map((part) => [part.type, part.value]));
  // A week starts two days before its Monday, twelve hours into the day. Moved that far on,
  // a moment lands in the calendar week the cabin week is named after.
  const ahead = 2 * 24 - CHANGEOVER_HOUR;
  const moved = Date.UTC(Number(clock.year), Number(clock.month) - 1, Number(clock.day), Number(clock.hour) + ahead);
  return calendarWeekOf(new Date(moved));
}

export function easterSunday(year) {
  // The anonymous Gregorian algorithm (Meeus, Jones, Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * The week of Easter on the cabin: the one with Maundy Thursday and Good Friday in it.
 * It ends on Easter Saturday, so Easter Sunday is in the week after.
 */
export function easterWeek(year) {
  const goodFriday = new Date(easterSunday(year).getTime() - 2 * DAY);
  return calendarWeekOf(goodFriday);
}

/** "lør. 20. – lør. 27. mars 2027", or without the year where a heading above already says it. */
export function formatRange(id, { year = true } = {}) {
  const from = startOf(id);
  const to = endOf(id);
  const day = (date) => `lør. ${date.getUTCDate()}.`;
  const month = (date) => MONTHS[date.getUTCMonth()];
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const closing = year ? ` ${to.getUTCFullYear()}` : '';

  if (from.getUTCMonth() === to.getUTCMonth()) return `${day(from)} – ${day(to)} ${month(to)}${closing}`;
  const opening = year && !sameYear ? ` ${from.getUTCFullYear()}` : '';
  return `${day(from)} ${month(from)}${opening} – ${day(to)} ${month(to)}${closing}`;
}

/** The month a week is listed under: the one most of its seven nights fall in. */
export function monthOf(id) {
  const name = MONTHS[middleNight(id).getUTCMonth()];
  return `${name[0].toUpperCase()}${name.slice(1)} ${yearOf(id)}`;
}

/**
 * The year a week counts for: the one most of its seven nights fall in. Around New Year that
 * is not always the year in its name: "2026-W01" starts on 27 December 2025 and counts for 2025.
 */
export function yearOf(id) {
  return middleNight(id).getUTCFullYear();
}

function middleNight(id) {
  return new Date(startOf(id).getTime() + 3 * DAY);
}

/** "11. oktober 2026 kl. 15:42", in Norwegian time, from a stored moment. */
export function formatMoment(iso) {
  return osloMoment.format(new Date(iso));
}

// The two below count in weeks of the calendar, Monday to Sunday, which is how a week gets
// its name. Nothing outside this file should need them: a day on the cabin belongs to the
// week `startOf` and `endOf` say, and a Saturday belongs to two.

function calendarWeekOf(date) {
  // A week of the calendar belongs to the year its Thursday is in.
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function mondayIn(id) {
  const match = WEEK_ID.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // 4 January is always in week 1 of the calendar.
  const monday = new Date(Date.UTC(year, 0, 4));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1 + (week - 1) * 7);
  return calendarWeekOf(monday) === id ? monday : null;
}

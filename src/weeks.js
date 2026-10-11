// A week on the cabin runs from Friday to Friday, Norwegian time. Those who leave are out by
// twelve, so the cleaner gets through before the next group comes after work. Those who come get
// the whole weekend on the mountain, and those who leave have theirs at home. That is Ragnhild's
// rule and her reason. It is not a week of the calendar, which runs from Monday to Sunday.
//
// So a week has two moments on its first Friday. At twelve it changes hands: the week before it
// is over, and this is the week we are in. After work, those who have it may come.
//
// A week is named after the working week inside it. "2027-W12" starts on the Friday before
// week 12, 19 March 2027, and ends on the Friday of week 12, 26 March.
// Written that way, weeks sort as text: "2026-W53" < "2027-W01".
//
// Every date here is a calendar day held as midnight UTC, so summer time never moves one.
//
// The rule is all in this file: the day, the hours, and the words that say it. Whatever shows a
// week's days, asks which week it is, or tells people the rule, takes it from here.

/** The day a week changes hands, counted back from the Monday of the working week it is named after. */
const CHANGEOVER_DAY = { daysBeforeMonday: 3, name: 'fredag', short: 'fre.' };

/** The hour, on the clock in Norway, when a week ends on its last Friday: those who leave are out by then. */
export const CHANGEOVER_HOUR = 12;

/** The hour those who have the week may come from. Ragnhild said "etter jobb"; four o'clock is our reading of it. */
export const ARRIVAL_HOUR = 16;

/** The rule as people are told it: on the calendar page, in the Friday overview and in the calendar file. */
export const RULE_IN_WORDS =
  `Hytteuka går fra ${CHANGEOVER_DAY.name} til ${CHANGEOVER_DAY.name}. De som reiser, er ute til klokka ${CHANGEOVER_HOUR}, ` +
  'så vaskehjelpen rekker over før de neste kommer etter jobb.';

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

/** The Friday a week starts on, or null when the text names no week (as "2027-W53" does not). */
export function startOf(id) {
  const monday = mondayIn(id);
  return monday && new Date(monday.getTime() - CHANGEOVER_DAY.daysBeforeMonday * DAY);
}

/** The Friday a week ends on, which is the day the next one starts. */
export function endOf(id) {
  const start = startOf(id);
  return start && new Date(start.getTime() + 7 * DAY);
}

/** The moment those who have a week may come: after work on its first Friday, on the clock in Norway. */
export function startsAt(id) {
  const day = startOf(id);
  return day && clockOn(day, ARRIVAL_HOUR);
}

/** The moment those who have a week are out: twelve on its last Friday. The cleaner has it until the next come. */
export function endsAt(id) {
  const day = endOf(id);
  return day && clockOn(day, CHANGEOVER_HOUR);
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

/** The week it is on the cabin at this moment. It changes at twelve on a Friday. */
export function currentWeek(now = new Date()) {
  const clock = Object.fromEntries(osloClock.formatToParts(now).map((part) => [part.type, part.value]));
  // A week changes hands three days before its Monday, twelve hours into the day. Moved that far
  // on, a moment lands in the calendar week the cabin week is named after.
  const ahead = CHANGEOVER_DAY.daysBeforeMonday * 24 - CHANGEOVER_HOUR;
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
 * The week of Easter on the cabin: the one with Palm Sunday and Maundy Thursday in it.
 * It ends at twelve on Good Friday, so the Easter weekend itself is in the week after.
 */
export function easterWeek(year) {
  const maundyThursday = new Date(easterSunday(year).getTime() - 3 * DAY);
  return calendarWeekOf(maundyThursday);
}

/** "fre. 19. – fre. 26. mars 2027", or without the year where a heading above already says it. */
export function formatRange(id, { year = true } = {}) {
  const from = startOf(id);
  const to = endOf(id);
  const day = (date) => `${CHANGEOVER_DAY.short} ${date.getUTCDate()}.`;
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
 * is not always the year in its name: "2026-W01" starts on 26 December 2025 and counts for 2025.
 */
export function yearOf(id) {
  return middleNight(id).getUTCFullYear();
}

function middleNight(id) {
  return new Date(startOf(id).getTime() + 3 * DAY);
}

/** An hour of the day on the clock in Norway, on a calendar day, as the moment it is everywhere. */
function clockOn(day, hour) {
  // Norway is one hour ahead of UTC in winter and two in summer, and the clock is set at night,
  // never in the middle of a day. So the hour Norway shows when UTC shows this one says how far ahead it is that day.
  const utc = day.getTime() + hour * HOUR;
  const shown = osloClock.formatToParts(new Date(utc)).find((part) => part.type === 'hour').value;
  return new Date(utc - (Number(shown) - hour) * HOUR);
}

/** "11. oktober 2026 kl. 15:42", in Norwegian time, from a stored moment. */
export function formatMoment(iso) {
  return osloMoment.format(new Date(iso));
}

// The two below count in weeks of the calendar, Monday to Sunday, which is how a week gets
// its name. Nothing outside this file should need them: a day on the cabin belongs to the
// week `startOf` and `endOf` say, and a Friday belongs to two.

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

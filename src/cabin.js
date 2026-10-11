// The rules of the cabin book.
//
// Everything that is stored is one object:
//
//   bookings: { [week]: { name, at } }                       who has the cabin that week
//   draws:    { [week]: { label, entries: [{ name, at }] } } the weeks a winner is drawn for
//   waiting:  { [week]: [{ name, at }] }                     who waits for a week that is taken, the first one first
//
// A week is a week on the cabin, not of the calendar: `weeks.js` says which days that is.
// A week has at most one booking, since bookings are kept by week.
// A week has people waiting only while it is booked, and never when a winner is drawn for it. When the one
// who has it gives it up, the first of them gets it: that booking's `after` is the name of the one who gave it up.
// A book from before the waiting list has no `waiting`. Read a week's with `waitingFor`.
// A draw is done when its week has a booking: that booking is the winner, and its `at` is when it was drawn.
// Easter is one trip of two weeks with one draw and one winner. Its draw, its entries and the winner's booking
// are kept on its first week, like any draw's, and its second week holds nothing: see `tripOf`.
// Ask `describe` about a week; `bookings` and `draws` alone do not say who has Easter's second week.
// Nobody wins two weeks in the same year. The year is the one the week is in (`yearOf`), whenever it is drawn.
//
// Each rule takes the state and what someone wants, and either changes the state and answers
// { ok: true }, or leaves it as it was and answers { ok: false, status, message } with words for the person.

import { randomInt } from 'node:crypto';
import { addWeeks, currentWeek, easterTrip, easterWeek, isWeekId, weekNumber, weeksFrom, yearOf } from './weeks.js';

/** How many weeks are shown and can be booked, counting the one we are in. */
export const HORIZON = 52;

const NAME_LENGTH = 60;
const LABEL_LENGTH = 40;

export function emptyState() {
  return { bookings: {}, draws: {}, waiting: {} };
}

/** What the book holds the first time it is opened: the weeks Ragnhild named, set up for a draw. */
export function firstState(now = new Date()) {
  const state = emptyState();
  const today = currentWeek(now);
  const year = Number(today.slice(0, 4));
  const next = (weekIn) => [weekIn(year), weekIn(year + 1)].find((week) => isOpen(week, today));

  const winterBreak = next((y) => `${y}-W08`);
  const easter = next(easterWeek);
  if (winterBreak) state.draws[winterBreak] = { label: 'Vinterferie', entries: [] };
  if (easter) state.draws[easter] = { label: 'Påske', entries: [] };
  return state;
}

/** A name as someone typed it, tidied. Empty when it cannot be used as a name. */
export function readName(text) {
  const name = tidy(text);
  return name.length <= NAME_LENGTH ? name : '';
}

export function sameName(a, b) {
  return tidy(a).toLocaleLowerCase('nb') === tidy(b).toLocaleLowerCase('nb');
}

export function isEntered(draw, name) {
  return draw.entries.some((entry) => sameName(entry.name, name));
}

/**
 * The weeks someone has won, by the year each counts for: { 2027: "2027-W08" }.
 * A week is won while they have it. Someone who gave their week up has won nothing that year.
 */
export function winsOf(state, name) {
  const wins = {};
  for (const week of Object.keys(state.draws)) {
    const booking = state.bookings[week];
    if (booking && sameName(booking.name, name)) wins[yearOf(week)] = week;
  }
  return wins;
}

/** The weeks someone has won, said in words, by year: { 2027: "uke 12 og 13" }. */
export function winsInWords(state, name) {
  return Object.fromEntries(Object.entries(winsOf(state, name)).map(([year, week]) => [year, ukeOf(state, week)]));
}

/**
 * What a draw on a week is for. Easter is one trip: a draw on its first week is for that week and
 * the next, with one winner, since nobody goes to the mountains for half an Easter. Asked about
 * either of the two weeks, this answers with the trip: { week: its first, through: its second }.
 * For every other week, `week` and `through` are the week itself.
 *
 * The second week holds nothing of its own. Where it does, in a book from before Easter was one
 * trip, or because someone had the week before the draw was set up, it is left as it is, and the
 * draw is for the first week only, as it was. Nothing is taken from anyone.
 */
export function tripOf(state, week) {
  if (isWeekId(week)) {
    if (reaches(state, week)) return { week, through: addWeeks(week, 1) };
    const before = addWeeks(week, -1);
    if (reaches(state, before)) return { week: before, through: week };
  }
  return { week, through: week };
}

/** Whether the draw on this week is for the week after it too. */
function reaches(state, week) {
  if (!state.draws[week]) return false;
  const easter = easterTrip(yearOf(week));
  if (easter.week !== week) return false;
  const second = easter.through;
  return !state.bookings[second] && !state.draws[second] && waitingFor(state, second).length === 0;
}

/**
 * The weeks from this one on, each with what stands in the book about it.
 * A trip of two weeks is there once, also when the week we are in is its second.
 */
export function calendar(state, today) {
  const entries = new Map();
  for (const week of weeksFrom(today, HORIZON)) {
    const entry = describe(state, week);
    if (!entries.has(entry.week)) entries.set(entry.week, entry);
  }
  return [...entries.values()];
}

/** What stands in the book about a week, or about the trip the week is part of: `week` is then the trip's first. */
export function describe(state, asked) {
  const { week, through } = tripOf(state, asked);
  return {
    week,
    through,
    booking: state.bookings[week] ?? null,
    draw: state.draws[week] ?? null,
    waiting: waitingFor(state, week),
  };
}

/** Those who wait for a week, the first one first. */
export function waitingFor(state, week) {
  return state.waiting?.[week] ?? [];
}

export function book(state, wish) {
  const { week, through, name, today, now } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (state.draws[week]) {
    return booking
      ? refuse(`Det er trukket lodd om ${uke(week, through)}, og den gikk til ${booking.name}.`)
      : refuse(`Det trekkes lodd om ${uke(week, through)}. Meld deg på trekningen i stedet.`);
  }
  if (booking) {
    if (sameName(booking.name, name)) return refuse(`Du har allerede ${uke(week, through)}.`);
    const next = isWaiting(state, week, name) ? 'Du står på ventelista.' : 'Du kan sette deg på venteliste.';
    return refuse(`${Uke(week)} er allerede booket av ${booking.name}. ${next}`);
  }

  state.bookings[week] = { name: readName(name), at: now };
  return done();
}

/**
 * Giving a week up. It goes to the first of those who wait for it, and is free when nobody does.
 * A week that was won in a draw goes back to be drawn among the others. Easter is given up whole.
 */
export function cancel(state, wish) {
  const { week, through, name, today, now } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (!booking) return refuse(`${Uke(week, through)} er ikke booket.`);
  if (!sameName(booking.name, name)) return refuse(`${Uke(week, through)} er booket av ${booking.name}, ikke av deg.`, 403);

  delete state.bookings[week];
  const draw = state.draws[week];
  if (draw) draw.entries = draw.entries.filter((entry) => !sameName(entry.name, name));

  const [first, ...others] = waitingFor(state, week);
  if (first) {
    state.bookings[week] = { name: first.name, at: now, after: booking.name };
    setWaiting(state, week, others);
  }
  return done();
}

/** Waiting for a week someone else has. Whoever has waited longest gets it if it is given up. */
export function wait(state, wish) {
  const { week, through, name, today, now } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (state.draws[week]) {
    // A week that was won has no waiting list: it is drawn again among those who entered.
    const again = 'trekkes det på nytt blant de andre som var påmeldt';
    return booking
      ? refuse(`Det er trukket lodd om ${uke(week, through)}. Sier ${booking.name} den fra seg, ${again}.`)
      : refuse(`Det trekkes lodd om ${uke(week, through)}. Meld deg på trekningen i stedet.`);
  }
  if (!booking) return refuse(`${Uke(week)} er ledig. Book den i stedet.`);
  if (sameName(booking.name, name)) return refuse(`Du har allerede ${uke(week, through)}.`);
  if (isWaiting(state, week, name)) return refuse(`Du står allerede på ventelista for ${uke(week, through)}.`);

  setWaiting(state, week, [...waitingFor(state, week), { name: readName(name), at: now }]);
  return done();
}

export function stopWaiting(state, wish) {
  const { week, through, name, today } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name);
  if (problem) return problem;
  if (!isWaiting(state, week, name)) return refuse(`Du står ikke på ventelista for ${uke(week, through)}.`);

  setWaiting(state, week, waitingFor(state, week).filter((entry) => !sameName(entry.name, name)));
  return done();
}

export function enter(state, wish) {
  const { week, through, name, today, now } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name) ?? drawProblem(state, week, through);
  if (problem) return problem;

  const draw = state.draws[week];
  if (isEntered(draw, name)) return refuse(`Du er allerede påmeldt trekningen om ${uke(week, through)}.`);
  const won = winsOf(state, name)[yearOf(week)];
  if (won) return refuse(`Du vant ${ukeOf(state, won)}, og kan ikke vinne en uke til i ${yearOf(week)}.`);

  draw.entries.push({ name: readName(name), at: now });
  return done();
}

export function withdraw(state, wish) {
  const { week, through, name, today } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? nameProblem(name) ?? drawProblem(state, week, through);
  if (problem) return problem;

  const draw = state.draws[week];
  if (!isEntered(draw, name)) return refuse(`Du er ikke påmeldt trekningen om ${uke(week, through)}.`);

  draw.entries = draw.entries.filter((entry) => !sameName(entry.name, name));
  return done();
}

/**
 * Draws the winner: one of those entered, each with the same chance, and books the week for them.
 * `pick(count)` answers a whole number from 0 up to, not including, count.
 *
 * Easter's draw has one winner for both its weeks. The booking is written on the first, as for any
 * draw, and `tripOf` makes it hold for the second.
 *
 * Whoever has won another week the same year is not in the draw. Their ticket was taken out when
 * they won, so this only finds any in a book from before that rule; it is asked here all the same,
 * since this is where a second week would be won.
 */
export function drawWinner(state, wish) {
  const { week, through, today, now, pick = randomInt } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? drawProblem(state, week, through);
  if (problem) return problem;

  const draw = state.draws[week];
  const year = yearOf(week);
  if (draw.entries.length === 0) return refuse(`Ingen har meldt seg på trekningen om ${uke(week, through)} ennå.`);
  const tickets = draw.entries.filter((entry) => !winsOf(state, entry.name)[year]);
  if (tickets.length === 0) {
    return refuse(`Alle som er påmeldt trekningen om ${uke(week, through)}, har alt vunnet en uke i ${year}.`);
  }

  const winner = pick(tickets.length);
  const name = tickets[winner].name;
  draw.entries = tickets;
  state.bookings[week] = { name, at: now };

  // The winner's tickets in the other draws of that year are taken out, so every ticket shown can win.
  for (const [other, { entries }] of Object.entries(state.draws)) {
    if (other === week || yearOf(other) !== year || state.bookings[other]) continue;
    state.draws[other].entries = entries.filter((entry) => !sameName(entry.name, name));
  }

  return done({ winner, entries: tickets.map((entry) => entry.name) });
}

export function markDraw(state, wish) {
  const { week, through, label, today } = whole(state, wish);
  const problem = weekProblem(week, today, through);
  if (problem) return problem;

  const title = tidy(label);
  if (title.length > LABEL_LENGTH) return refuse(`Navnet på uka kan være på ${LABEL_LENGTH} tegn.`, 400);
  if (state.draws[week]) return refuse(`Det trekkes allerede lodd om ${uke(week, through)}.`);
  const booking = state.bookings[week];
  if (booking) return refuse(`${Uke(week)} er allerede booket av ${booking.name}, så den kan det ikke trekkes lodd om.`);

  state.draws[week] = { label: title, entries: [] };
  return done();
}

export function unmarkDraw(state, wish) {
  const { week, through, today } = whole(state, wish);
  const problem = weekProblem(week, today, through) ?? drawProblem(state, week, through);
  if (problem) return problem;

  const count = state.draws[week].entries.length;
  if (count > 0) {
    const ordinary = through === week ? 'den kan ikke gjøres om til en vanlig uke' : 'de kan ikke gjøres om til vanlige uker';
    return refuse(`${count} har meldt seg på trekningen om ${uke(week, through)}, så ${ordinary}.`);
  }

  delete state.draws[week];
  return done();
}

/** "uke 45", or "uke 12 og 13" for a trip of two weeks. */
export function uke(week, through = week) {
  return through === week ? `uke ${weekNumber(week)}` : `uke ${weekNumber(week)} og ${weekNumber(through)}`;
}

export function Uke(week, through = week) {
  return `U${uke(week, through).slice(1)}`;
}

/** A week in words, as the trip it is part of. */
function ukeOf(state, asked) {
  const { week, through } = tripOf(state, asked);
  return uke(week, through);
}

/** What someone asks for, about the whole trip the week they named is part of. */
function whole(state, wish) {
  return { ...wish, ...tripOf(state, wish.week) };
}

function isOpen(week, today) {
  return isWeekId(week) && week >= today && week < addWeeks(today, HORIZON);
}

/** Why a week, or a trip that runs through to a later week, cannot be touched: it is not there, over, or too far ahead. */
function weekProblem(week, today, through = week) {
  if (!isWeekId(week)) return refuse('Den uka finnes ikke.', 404);
  if (through < today) return refuse(`${Uke(week, through)} er over.`);
  if (week >= addWeeks(today, HORIZON)) return refuse(`${Uke(week, through)} er for langt fram til å stå i boka ennå.`);
  return null;
}

function nameProblem(name) {
  return readName(name) ? null : refuse('Skriv navnet ditt først.', 400);
}

/** Why nobody can enter, leave or draw: there is no draw for the week, or it is done. */
function drawProblem(state, week, through = week) {
  if (!state.draws[week]) return refuse(`Det trekkes ikke lodd om ${uke(week, through)}.`);
  const booking = state.bookings[week];
  const prize = through === week ? 'Uka' : 'Turen';
  if (booking) return refuse(`Trekningen om ${uke(week, through)} er gjort. ${prize} gikk til ${booking.name}.`);
  return null;
}

function isWaiting(state, week, name) {
  return waitingFor(state, week).some((entry) => sameName(entry.name, name));
}

/** A week nobody waits for is not kept, so the book holds a week's people only while it has some. */
function setWaiting(state, week, people) {
  state.waiting ??= {};
  if (people.length > 0) state.waiting[week] = people;
  else delete state.waiting[week];
}

function tidy(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
}

function refuse(message, status = 409) {
  return { ok: false, status, message };
}

function done(more = {}) {
  return { ok: true, ...more };
}

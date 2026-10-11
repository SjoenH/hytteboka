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
// Nobody wins two weeks in the same year. The year is the one the week is in (`yearOf`), whenever it is drawn.
//
// Each rule takes the state and what someone wants, and either changes the state and answers
// { ok: true }, or leaves it as it was and answers { ok: false, status, message } with words for the person.

import { randomInt } from 'node:crypto';
import { addWeeks, currentWeek, easterWeek, isWeekId, weekNumber, weeksFrom, yearOf } from './weeks.js';

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

/** The weeks from this one on, each with what stands in the book about it. */
export function calendar(state, today) {
  return weeksFrom(today, HORIZON).map((week) => describe(state, week));
}

export function describe(state, week) {
  return {
    week,
    booking: state.bookings[week] ?? null,
    draw: state.draws[week] ?? null,
    waiting: waitingFor(state, week),
  };
}

/** Those who wait for a week, the first one first. */
export function waitingFor(state, week) {
  return state.waiting?.[week] ?? [];
}

export function book(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (state.draws[week]) {
    return booking
      ? refuse(`Det er trukket lodd om ${uke(week)}, og den gikk til ${booking.name}.`)
      : refuse(`Det trekkes lodd om ${uke(week)}. Meld deg på trekningen i stedet.`);
  }
  if (booking) {
    if (sameName(booking.name, name)) return refuse(`Du har allerede ${uke(week)}.`);
    const next = isWaiting(state, week, name) ? 'Du står på ventelista.' : 'Du kan sette deg på venteliste.';
    return refuse(`${Uke(week)} er allerede booket av ${booking.name}. ${next}`);
  }

  state.bookings[week] = { name: readName(name), at: now };
  return done();
}

/**
 * Giving a week up. It goes to the first of those who wait for it, and is free when nobody does.
 * A week that was won in a draw goes back to be drawn among the others.
 */
export function cancel(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (!booking) return refuse(`${Uke(week)} er ikke booket.`);
  if (!sameName(booking.name, name)) return refuse(`${Uke(week)} er booket av ${booking.name}, ikke av deg.`, 403);

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
export function wait(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;

  const booking = state.bookings[week];
  if (state.draws[week]) {
    // A week that was won has no waiting list: it is drawn again among those who entered.
    const again = 'trekkes det på nytt blant de andre som var påmeldt';
    return booking
      ? refuse(`Det er trukket lodd om ${uke(week)}. Sier ${booking.name} den fra seg, ${again}.`)
      : refuse(`Det trekkes lodd om ${uke(week)}. Meld deg på trekningen i stedet.`);
  }
  if (!booking) return refuse(`${Uke(week)} er ledig. Book den i stedet.`);
  if (sameName(booking.name, name)) return refuse(`Du har allerede ${uke(week)}.`);
  if (isWaiting(state, week, name)) return refuse(`Du står allerede på ventelista for ${uke(week)}.`);

  setWaiting(state, week, [...waitingFor(state, week), { name: readName(name), at: now }]);
  return done();
}

export function stopWaiting(state, { week, name, today }) {
  const problem = weekProblem(week, today) ?? nameProblem(name);
  if (problem) return problem;
  if (!isWaiting(state, week, name)) return refuse(`Du står ikke på ventelista for ${uke(week)}.`);

  setWaiting(state, week, waitingFor(state, week).filter((entry) => !sameName(entry.name, name)));
  return done();
}

export function enter(state, { week, name, today, now }) {
  const problem = weekProblem(week, today) ?? nameProblem(name) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  if (isEntered(draw, name)) return refuse(`Du er allerede påmeldt trekningen om ${uke(week)}.`);
  const won = winsOf(state, name)[yearOf(week)];
  if (won) return refuse(`Du vant ${uke(won)}, og kan ikke vinne en uke til i ${yearOf(week)}.`);

  draw.entries.push({ name: readName(name), at: now });
  return done();
}

export function withdraw(state, { week, name, today }) {
  const problem = weekProblem(week, today) ?? nameProblem(name) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  if (!isEntered(draw, name)) return refuse(`Du er ikke påmeldt trekningen om ${uke(week)}.`);

  draw.entries = draw.entries.filter((entry) => !sameName(entry.name, name));
  return done();
}

/**
 * Draws the winner: one of those entered, each with the same chance, and books the week for them.
 * `pick(count)` answers a whole number from 0 up to, not including, count.
 *
 * Whoever has won another week the same year is not in the draw. Their ticket was taken out when
 * they won, so this only finds any in a book from before that rule; it is asked here all the same,
 * since this is where a second week would be won.
 */
export function drawWinner(state, { week, today, now, pick = randomInt }) {
  const problem = weekProblem(week, today) ?? drawProblem(state, week);
  if (problem) return problem;

  const draw = state.draws[week];
  const year = yearOf(week);
  if (draw.entries.length === 0) return refuse(`Ingen har meldt seg på trekningen om ${uke(week)} ennå.`);
  const tickets = draw.entries.filter((entry) => !winsOf(state, entry.name)[year]);
  if (tickets.length === 0) {
    return refuse(`Alle som er påmeldt trekningen om ${uke(week)}, har alt vunnet en uke i ${year}.`);
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

export function markDraw(state, { week, label, today }) {
  const problem = weekProblem(week, today);
  if (problem) return problem;

  const title = tidy(label);
  if (title.length > LABEL_LENGTH) return refuse(`Navnet på uka kan være på ${LABEL_LENGTH} tegn.`, 400);
  if (state.draws[week]) return refuse(`Det trekkes allerede lodd om ${uke(week)}.`);
  const booking = state.bookings[week];
  if (booking) return refuse(`${Uke(week)} er allerede booket av ${booking.name}, så den kan det ikke trekkes lodd om.`);

  state.draws[week] = { label: title, entries: [] };
  return done();
}

export function unmarkDraw(state, { week, today }) {
  const problem = weekProblem(week, today) ?? drawProblem(state, week);
  if (problem) return problem;

  const count = state.draws[week].entries.length;
  if (count > 0) {
    return refuse(`${count} har meldt seg på trekningen om ${uke(week)}, så den kan ikke gjøres om til en vanlig uke.`);
  }

  delete state.draws[week];
  return done();
}

export function uke(week) {
  return `uke ${weekNumber(week)}`;
}

export function Uke(week) {
  return `Uke ${weekNumber(week)}`;
}

function isOpen(week, today) {
  return isWeekId(week) && week >= today && week < addWeeks(today, HORIZON);
}

function weekProblem(week, today) {
  if (!isWeekId(week)) return refuse('Den uka finnes ikke.', 404);
  if (week < today) return refuse(`${Uke(week)} er over.`);
  if (!isOpen(week, today)) return refuse(`${Uke(week)} er for langt fram til å stå i boka ennå.`);
  return null;
}

function nameProblem(name) {
  return readName(name) ? null : refuse('Skriv navnet ditt først.', 400);
}

/** Why nobody can enter, leave or draw: there is no draw for the week, or it is done. */
function drawProblem(state, week) {
  if (!state.draws[week]) return refuse(`Det trekkes ikke lodd om ${uke(week)}.`);
  const booking = state.bookings[week];
  if (booking) return refuse(`Trekningen om ${uke(week)} er gjort. Uka gikk til ${booking.name}.`);
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

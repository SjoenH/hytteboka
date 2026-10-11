import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  book, calendar, cancel, drawWinner, emptyState, enter, firstState, HORIZON, markDraw, readName, sameName,
  stopWaiting, unmarkDraw, wait, waitingFor, winsOf, withdraw,
} from '../src/cabin.js';

// The week the tests happen in: Saturday 10 to Saturday 17 October 2026.
const TODAY = '2026-W42';
const AUTUMN = '2026-W45';
const EASTER = '2027-W12';
const NOW = '2026-10-14T08:00:00.000Z';

const as = (name, week) => ({ name, week, today: TODAY, now: NOW });

/** A book where a winner is to be drawn for Easter. */
function bookWithEaster(...entered) {
  const state = emptyState();
  state.draws[EASTER] = { label: 'Påske', entries: [] };
  for (const name of entered) assert.equal(enter(state, as(name, EASTER)).ok, true);
  return state;
}

/** Checks that a rule said no, with the words it used, and left the book as it was. */
function refused(state, rule, wish, words, status = 409) {
  const before = structuredClone(state);
  const answer = rule(state, wish);
  assert.equal(answer.ok, false);
  assert.equal(answer.status, status);
  assert.match(answer.message, words);
  assert.deepEqual(state, before, 'a refused wish changes nothing');
}

describe('booking a week', () => {
  test('a free week goes to the one who books it', () => {
    const state = emptyState();
    assert.deepEqual(book(state, as('Ola Nordmann', AUTUMN)), { ok: true });
    assert.deepEqual(state.bookings[AUTUMN], { name: 'Ola Nordmann', at: NOW });
  });

  test('a week that is taken cannot be booked by someone else', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, book, as('Kari Hansen', AUTUMN), /Uke 45 er allerede booket av Ola Nordmann\. Du kan sette deg på venteliste\./);
    assert.equal(state.bookings[AUTUMN].name, 'Ola Nordmann');
  });

  test('the one who has the week is told so when they book it again', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, book, as('ola nordmann', AUTUMN), /Du har allerede uke 45/);
  });

  test('the week we are in can be booked, and the last of the 52', () => {
    const state = emptyState();
    assert.equal(book(state, as('Ola Nordmann', TODAY)).ok, true);
    assert.equal(book(state, as('Ola Nordmann', '2027-W40')).ok, true);
  });

  test('a week that is over, too far ahead or not a week cannot be booked', () => {
    const state = emptyState();
    refused(state, book, as('Ola Nordmann', '2026-W41'), /Uke 41 er over/);
    refused(state, book, as('Ola Nordmann', '2027-W41'), /for langt fram/);
    refused(state, book, as('Ola Nordmann', '2027-W53'), /finnes ikke/, 404);
    refused(state, book, as('Ola Nordmann', 'tull'), /finnes ikke/, 404);
  });

  test('nobody books without a name', () => {
    const state = emptyState();
    refused(state, book, as('', AUTUMN), /Skriv navnet ditt/, 400);
    refused(state, book, as('   ', AUTUMN), /Skriv navnet ditt/, 400);
    refused(state, book, as('x'.repeat(61), AUTUMN), /Skriv navnet ditt/, 400);
  });

  test('a name is the same however it is typed', () => {
    assert.equal(readName('  Ola \t Nordmann\n'), 'Ola Nordmann');
    assert.equal(sameName('Ola Nordmann', ' ola   NORDMANN '), true);
    assert.equal(sameName('Åse Ødegård', 'åse ødegård'), true);
    assert.equal(sameName('Ola Nordmann', 'Ola Normann'), false);
  });
});

describe('giving a week up', () => {
  test('the one who has the week can give it up, and then it is free', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    assert.equal(cancel(state, as('ola nordmann', AUTUMN)).ok, true);
    assert.equal(state.bookings[AUTUMN], undefined);
    assert.equal(book(state, as('Kari Hansen', AUTUMN)).ok, true);
  });

  test('nobody gives up a week that is someone else’s', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, cancel, as('Kari Hansen', AUTUMN), /booket av Ola Nordmann, ikke av deg/, 403);
  });

  test('a week nobody has cannot be given up', () => {
    refused(emptyState(), cancel, as('Ola Nordmann', AUTUMN), /Uke 45 er ikke booket/);
  });
});

// Ragnhild asked for a waiting list when the week is taken.
describe('waiting for a week that is taken', () => {
  const LATER = '2026-10-20T09:30:00.000Z';
  const names = (state, week = AUTUMN) => waitingFor(state, week).map((entry) => entry.name);

  /** A book where Ola has the autumn week, and those named wait for it in that order. */
  function bookWithOlasWeek(...waiting) {
    const state = emptyState();
    assert.equal(book(state, as('Ola Nordmann', AUTUMN)).ok, true);
    for (const name of waiting) assert.equal(wait(state, as(name, AUTUMN)).ok, true);
    return state;
  }

  test('those who want a week that is taken wait for it, in the order they came', () => {
    const state = bookWithOlasWeek();
    assert.deepEqual(wait(state, as('Kari Hansen', AUTUMN)), { ok: true });
    assert.deepEqual(wait(state, as('  Per   Olsen ', AUTUMN)), { ok: true });

    assert.deepEqual(state.waiting[AUTUMN], [{ name: 'Kari Hansen', at: NOW }, { name: 'Per Olsen', at: NOW }]);
    assert.equal(state.bookings[AUTUMN].name, 'Ola Nordmann', 'the week is still his');
  });

  test('one person has one place', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    refused(state, wait, as('KARI HANSEN', AUTUMN), /Du står allerede på ventelista for uke 45/);
  });

  test('someone who waits and tries to book the week is told that they wait', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    refused(state, book, as('Kari Hansen', AUTUMN), /Uke 45 er allerede booket av Ola Nordmann\. Du står på ventelista\./);
  });

  test('the one who has the week does not wait for it', () => {
    refused(bookWithOlasWeek(), wait, as('ola nordmann', AUTUMN), /Du har allerede uke 45/);
  });

  test('nobody waits for a week that is free', () => {
    refused(emptyState(), wait, as('Kari Hansen', AUTUMN), /Uke 45 er ledig\. Book den i stedet\./);
  });

  test('nobody waits for a week a winner is drawn for, before the draw or after it', () => {
    const state = emptyState();
    state.draws[EASTER] = { label: 'Påske', entries: [] };
    refused(state, wait, as('Kari Hansen', EASTER), /Det trekkes lodd om uke 12\. Meld deg på trekningen i stedet\./);

    enter(state, as('Ola Nordmann', EASTER));
    drawWinner(state, { week: EASTER, today: TODAY, now: NOW });
    refused(state, wait, as('Kari Hansen', EASTER), /Det er trukket lodd om uke 12\. Sier Ola Nordmann den fra seg/);
  });

  test('nobody waits without a name, or for a week that is over, too far ahead or not a week', () => {
    const state = bookWithOlasWeek();
    refused(state, wait, as('', AUTUMN), /Skriv navnet ditt/, 400);
    refused(state, wait, as('Kari Hansen', '2026-W41'), /Uke 41 er over/);
    refused(state, wait, as('Kari Hansen', '2027-W41'), /for langt fram/);
    refused(state, wait, as('Kari Hansen', 'tull'), /finnes ikke/, 404);
  });

  test('someone who waits can stop, and those behind move up', () => {
    const state = bookWithOlasWeek('Kari Hansen', 'Per Olsen', 'Nina Berg');
    assert.deepEqual(stopWaiting(state, as('kari hansen', AUTUMN)), { ok: true });
    assert.deepEqual(names(state), ['Per Olsen', 'Nina Berg']);

    refused(state, stopWaiting, as('Kari Hansen', AUTUMN), /Du står ikke på ventelista for uke 45/);
    refused(state, stopWaiting, as('Ola Nordmann', AUTUMN), /Du står ikke på ventelista for uke 45/);
    refused(state, stopWaiting, as('', AUTUMN), /Skriv navnet ditt/, 400);
  });

  test('a week nobody waits for any more is not kept', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    stopWaiting(state, as('Kari Hansen', AUTUMN));
    assert.deepEqual(state.waiting, {});
  });

  test('when the week is given up, the one who has waited longest gets it', () => {
    const state = bookWithOlasWeek('Kari Hansen', 'Per Olsen');
    assert.deepEqual(cancel(state, { ...as('Ola Nordmann', AUTUMN), now: LATER }), { ok: true });

    assert.deepEqual(state.bookings[AUTUMN], { name: 'Kari Hansen', at: LATER, after: 'Ola Nordmann' });
    assert.deepEqual(names(state), ['Per Olsen'], 'the others keep their places');
  });

  test('the week goes from one to the next, and is free when nobody waits', () => {
    const state = bookWithOlasWeek('Kari Hansen', 'Per Olsen');
    cancel(state, as('Ola Nordmann', AUTUMN));
    cancel(state, as('Kari Hansen', AUTUMN));
    assert.deepEqual(state.bookings[AUTUMN], { name: 'Per Olsen', at: NOW, after: 'Kari Hansen' });
    assert.deepEqual(state.waiting, {});

    cancel(state, as('Per Olsen', AUTUMN));
    assert.equal(state.bookings[AUTUMN], undefined);
    assert.deepEqual(book(state, as('Nina Berg', AUTUMN)), { ok: true });
    assert.deepEqual(state.bookings[AUTUMN], { name: 'Nina Berg', at: NOW }, 'a week that was free was not waited for');
  });

  test('someone who waits cannot give the week up for the one who has it', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    refused(state, cancel, as('Kari Hansen', AUTUMN), /booket av Ola Nordmann, ikke av deg/, 403);
  });

  test('the one who gave the week up can wait for it, behind the others', () => {
    const state = bookWithOlasWeek('Kari Hansen', 'Per Olsen');
    cancel(state, as('Ola Nordmann', AUTUMN));
    assert.equal(wait(state, as('Ola Nordmann', AUTUMN)).ok, true);
    assert.deepEqual(names(state), ['Per Olsen', 'Ola Nordmann']);
  });

  test('someone can wait for several weeks, and for one while they have another', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    book(state, as('Ola Nordmann', '2026-W46'));
    book(state, as('Kari Hansen', '2026-W47'));
    assert.equal(wait(state, as('Kari Hansen', '2026-W46')).ok, true);
    assert.deepEqual(Object.keys(state.waiting), [AUTUMN, '2026-W46']);
  });

  test('a week someone waits for cannot be set up for a draw', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    refused(state, markDraw, { week: AUTUMN, label: '', today: TODAY }, /allerede booket av Ola Nordmann/);
  });

  test('a week that was won is still drawn again when it is given up', () => {
    const state = emptyState();
    state.draws[EASTER] = { label: 'Påske', entries: [] };
    for (const name of ['Ola Nordmann', 'Kari Hansen']) enter(state, as(name, EASTER));
    drawWinner(state, { week: EASTER, today: TODAY, now: NOW, pick: () => 0 });

    cancel(state, as('Ola Nordmann', EASTER));
    assert.equal(state.bookings[EASTER], undefined, 'it goes to nobody before the next draw');
  });

  test('the calendar has those who wait with each week', () => {
    const state = bookWithOlasWeek('Kari Hansen');
    const weeks = calendar(state, TODAY);
    assert.deepEqual(weeks.find((entry) => entry.week === AUTUMN).waiting, [{ name: 'Kari Hansen', at: NOW }]);
    assert.deepEqual(weeks.find((entry) => entry.week === '2026-W46').waiting, []);
  });

  test('a book from before the waiting list works as it is', () => {
    const state = { bookings: { [AUTUMN]: { name: 'Ola Nordmann', at: NOW } }, draws: {} };
    assert.deepEqual(calendar(state, TODAY).find((entry) => entry.week === AUTUMN).waiting, []);
    refused(state, stopWaiting, as('Kari Hansen', AUTUMN), /Du står ikke på ventelista/);

    assert.equal(wait(state, as('Kari Hansen', AUTUMN)).ok, true);
    assert.deepEqual(names(state), ['Kari Hansen']);
    assert.equal(cancel(state, as('Ola Nordmann', AUTUMN)).ok, true);
    assert.equal(state.bookings[AUTUMN].name, 'Kari Hansen');

    const older = { bookings: { [AUTUMN]: { name: 'Ola Nordmann', at: NOW } }, draws: {} };
    assert.equal(cancel(older, as('Ola Nordmann', AUTUMN)).ok, true);
    assert.deepEqual(older, { bookings: {}, draws: {} }, 'giving a week up adds nothing to it');
  });
});

describe('entering a draw', () => {
  test('a week a winner is drawn for cannot be booked', () => {
    const state = bookWithEaster();
    refused(state, book, as('Ola Nordmann', EASTER), /Det trekkes lodd om uke 12/);
  });

  test('those who want the week enter, in the order they came', () => {
    const state = bookWithEaster('Ola Nordmann', 'Kari Hansen');
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Ola Nordmann', 'Kari Hansen']);
    assert.equal(state.bookings[EASTER], undefined);
  });

  test('one person has one ticket', () => {
    const state = bookWithEaster('Ola Nordmann');
    refused(state, enter, as('OLA NORDMANN', EASTER), /Du er allerede påmeldt/);
  });

  test('someone who entered can leave again', () => {
    const state = bookWithEaster('Ola Nordmann', 'Kari Hansen');
    assert.equal(withdraw(state, as('ola nordmann', EASTER)).ok, true);
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Kari Hansen']);
    refused(state, withdraw, as('Ola Nordmann', EASTER), /Du er ikke påmeldt/);
  });

  test('there is no draw to enter for an ordinary week', () => {
    refused(emptyState(), enter, as('Ola Nordmann', AUTUMN), /Det trekkes ikke lodd om uke 45/);
    refused(emptyState(), withdraw, as('Ola Nordmann', AUTUMN), /Det trekkes ikke lodd om uke 45/);
  });

  test('nobody enters without a name, or for a week that is over', () => {
    const state = bookWithEaster();
    refused(state, enter, as('', EASTER), /Skriv navnet ditt/, 400);
    state.draws['2026-W41'] = { label: '', entries: [] };
    refused(state, enter, as('Ola Nordmann', '2026-W41'), /Uke 41 er over/);
  });
});

describe('drawing the winner', () => {
  const people = ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'];
  const draw = (state, pick) => drawWinner(state, { week: EASTER, today: TODAY, now: NOW, pick });

  test('the one whose ticket is picked gets the week', () => {
    const state = bookWithEaster(...people);
    const asked = [];
    const answer = draw(state, (count) => {
      asked.push(count);
      return 1;
    });

    assert.deepEqual(answer, { ok: true, winner: 1, entries: people });
    assert.deepEqual(asked, [3], 'one pick among the three tickets');
    assert.deepEqual(state.bookings[EASTER], { name: 'Kari Hansen', at: NOW });
    assert.equal(state.draws[EASTER].entries.length, 3, 'the tickets stay, to show who was in the draw');
  });

  test('every ticket can win', () => {
    for (const [index, name] of people.entries()) {
      const state = bookWithEaster(...people);
      draw(state, () => index);
      assert.equal(state.bookings[EASTER].name, name);
    }
  });

  test('left to itself, the draw gives everyone the same chance', () => {
    const wins = [0, 0, 0];
    for (let round = 0; round < 6000; round += 1) {
      const state = bookWithEaster(...people);
      wins[drawWinner(state, { week: EASTER, today: TODAY, now: NOW }).winner] += 1;
    }
    // 2000 each on average. Outside 1800 to 2200 is more than five standard deviations away.
    for (const count of wins) assert.ok(count > 1800 && count < 2200, `wins were ${wins}`);
  });

  test('a single ticket wins', () => {
    const state = bookWithEaster('Ola Nordmann');
    assert.equal(drawWinner(state, { week: EASTER, today: TODAY, now: NOW }).winner, 0);
    assert.equal(state.bookings[EASTER].name, 'Ola Nordmann');
  });

  test('there is nothing to draw before someone has entered', () => {
    refused(bookWithEaster(), drawWinner, { week: EASTER, today: TODAY, now: NOW }, /Ingen har meldt seg på/);
  });

  test('a winner is drawn once', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, drawWinner, { week: EASTER, today: TODAY, now: NOW, pick: () => 2 }, /er gjort. Uka gikk til Ola Nordmann/);
  });

  test('no winner is drawn for an ordinary week', () => {
    refused(emptyState(), drawWinner, { week: AUTUMN, today: TODAY, now: NOW }, /Det trekkes ikke lodd om uke 45/);
  });

  test('after the draw nobody enters, leaves or books the week', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, enter, as('Nina Berg', EASTER), /Trekningen om uke 12 er gjort/);
    refused(state, withdraw, as('Kari Hansen', EASTER), /Trekningen om uke 12 er gjort/);
    refused(state, book, as('Nina Berg', EASTER), /gikk til Ola Nordmann/);
  });

  test('a winner who gives the week up is out, and it is drawn again among the others', () => {
    const state = bookWithEaster(...people);
    draw(state, () => 0);
    refused(state, cancel, as('Kari Hansen', EASTER), /ikke av deg/, 403);

    assert.equal(cancel(state, as('Ola Nordmann', EASTER)).ok, true);
    assert.equal(state.bookings[EASTER], undefined);
    assert.deepEqual(state.draws[EASTER].entries.map((entry) => entry.name), ['Kari Hansen', 'Per Olsen']);

    assert.equal(enter(state, as('Nina Berg', EASTER)).ok, true, 'the draw is open again');
    assert.deepEqual(draw(state, () => 2), { ok: true, winner: 2, entries: ['Kari Hansen', 'Per Olsen', 'Nina Berg'] });
    assert.equal(state.bookings[EASTER].name, 'Nina Berg');
  });
});

// Ragnhild's rule: whoever wins a draw cannot win another week the same year.
describe('nobody wins two weeks in the same year', () => {
  const WINTER = '2027-W08';
  const people = ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'];
  const draw = (state, week, pick) => drawWinner(state, { week, today: TODAY, now: NOW, pick });
  const names = (state, week) => state.draws[week].entries.map((entry) => entry.name);

  /** A book with a draw for each of the weeks given, and the same people entered in all of them. */
  function bookWithDraws(weeks, entered = people) {
    const state = emptyState();
    for (const week of weeks) {
      state.draws[week] = { label: '', entries: [] };
      for (const name of entered) assert.equal(enter(state, as(name, week)).ok, true);
    }
    return state;
  }

  test('people can be in several draws until one of them is drawn', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    assert.deepEqual(names(state, WINTER), people);
    assert.deepEqual(names(state, EASTER), people);
  });

  test('the one who wins has no ticket left in the other draws of that year', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    draw(state, WINTER, () => 1);

    assert.equal(state.bookings[WINTER].name, 'Kari Hansen');
    assert.deepEqual(names(state, EASTER), ['Ola Nordmann', 'Per Olsen']);
    assert.deepEqual(names(state, WINTER), people, 'the tickets of the draw that was won stay');
  });

  test('the next draw that year is among the others', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    draw(state, WINTER, () => 1);
    const asked = [];
    const answer = draw(state, EASTER, (count) => {
      asked.push(count);
      return 1;
    });

    assert.deepEqual(asked, [2]);
    assert.deepEqual(answer, { ok: true, winner: 1, entries: ['Ola Nordmann', 'Per Olsen'] });
    assert.equal(state.bookings[EASTER].name, 'Per Olsen');
  });

  test('someone who has won cannot enter another draw that year', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    draw(state, WINTER, () => 1);
    refused(state, enter, as('kari hansen', EASTER), /Du vant uke 8, og kan ikke vinne en uke til i 2027\./);
  });

  test('the same year means the year the weeks are in, whenever they are drawn', () => {
    // Christmas 2026 and the winter break 2027 are both drawn in October 2026, and are not the same year.
    const state = bookWithDraws(['2026-W52', WINTER, EASTER]);
    draw(state, '2026-W52', () => 1);

    assert.deepEqual(names(state, WINTER), people, 'a ticket for a week in another year is left alone');
    assert.equal(draw(state, WINTER, () => 1).ok, true);
    assert.equal(state.bookings[WINTER].name, 'Kari Hansen', 'she can win a week in 2027 too');
    assert.deepEqual(winsOf(state, 'Kari Hansen'), { 2026: '2026-W52', 2027: WINTER });
  });

  test('a week around New Year counts for the year most of its nights fall in', () => {
    // 26 December 2026 to 2 January 2027 counts for 2026, and 2 to 9 January 2027 for 2027.
    const state = bookWithDraws(['2026-W53', '2027-W01', WINTER], ['Ola Nordmann']);
    state.draws[WINTER].entries = [];
    state.draws['2027-W01'].entries = [];
    draw(state, '2026-W53', () => 0);
    assert.equal(enter(state, as('Ola Nordmann', '2027-W01')).ok, true, 'the week after New Year is another year');

    draw(state, '2027-W01', () => 0);
    refused(state, enter, as('Ola Nordmann', WINTER), /Du vant uke 1, og kan ikke vinne en uke til i 2027\./);
  });

  test('the year is the one the nights are in, also when the name of the week says the next', () => {
    // "2026-W01" runs from 27 December 2025 to 3 January 2026: five of its seven nights are in 2025.
    const then = (name, week) => ({ name, week, today: '2025-W45', now: '2025-11-05T08:00:00.000Z' });
    const state = emptyState();
    for (const week of ['2025-W50', '2026-W01', '2026-W08']) state.draws[week] = { label: '', entries: [] };

    enter(state, then('Ola Nordmann', '2026-W01'));
    drawWinner(state, { ...then('', '2026-W01'), pick: () => 0 });
    assert.deepEqual(winsOf(state, 'Ola Nordmann'), { 2025: '2026-W01' });

    refused(state, enter, then('Ola Nordmann', '2025-W50'), /Du vant uke 1, og kan ikke vinne en uke til i 2025\./);
    assert.equal(enter(state, then('Ola Nordmann', '2026-W08')).ok, true, 'the winter break of 2026 is another year');
  });

  test('a winner who gives the week up has won nothing that year, and can enter and win again', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    draw(state, WINTER, () => 1);
    assert.equal(cancel(state, as('Kari Hansen', WINTER)).ok, true);

    assert.deepEqual(winsOf(state, 'Kari Hansen'), {});
    assert.equal(enter(state, as('Kari Hansen', EASTER)).ok, true);
    assert.deepEqual(names(state, EASTER), ['Ola Nordmann', 'Per Olsen', 'Kari Hansen']);
    assert.equal(draw(state, EASTER, () => 2).ok, true);
    assert.equal(state.bookings[EASTER].name, 'Kari Hansen');
  });

  test('the rule is about draws: a winner can book ordinary weeks, and someone with ordinary weeks can win', () => {
    const state = bookWithDraws([WINTER, EASTER]);
    assert.equal(book(state, as('Kari Hansen', '2027-W05')).ok, true);
    assert.equal(draw(state, WINTER, () => 1).ok, true);
    assert.equal(state.bookings[WINTER].name, 'Kari Hansen');
    assert.equal(book(state, as('Kari Hansen', '2027-W20')).ok, true);
    assert.deepEqual(winsOf(state, 'Kari Hansen'), { 2027: WINTER });
  });

  test('a draw never picks someone who has won that year, whatever an older book holds', () => {
    // A book from before the rule could have a winner still entered elsewhere.
    const state = bookWithDraws([WINTER, EASTER]);
    state.bookings[WINTER] = { name: 'Kari Hansen', at: NOW };
    assert.deepEqual(names(state, EASTER), people);

    const answer = draw(state, EASTER, () => 1);
    assert.deepEqual(answer, { ok: true, winner: 1, entries: ['Ola Nordmann', 'Per Olsen'] });
    assert.equal(state.bookings[EASTER].name, 'Per Olsen');
    assert.deepEqual(names(state, EASTER), ['Ola Nordmann', 'Per Olsen'], 'the draw was among these two');
  });

  test('left to itself, two draws in a year never go to the same person', () => {
    for (let round = 0; round < 300; round += 1) {
      const state = bookWithDraws([WINTER, EASTER]);
      drawWinner(state, { week: WINTER, today: TODAY, now: NOW });
      drawWinner(state, { week: EASTER, today: TODAY, now: NOW });
      assert.notEqual(state.bookings[EASTER].name, state.bookings[WINTER].name);
    }
  });

  test('there is nothing to draw when everyone entered has won that year already', () => {
    const state = bookWithDraws([WINTER, EASTER], ['Kari Hansen']);
    state.bookings[WINTER] = { name: 'Kari Hansen', at: NOW };
    refused(state, drawWinner, { week: EASTER, today: TODAY, now: NOW }, /har alt vunnet en uke i 2027/);
  });
});

describe('choosing the weeks a winner is drawn for', () => {
  const choose = (week, label = '') => ({ week, label, today: TODAY });

  test('a free week can be set up for a draw, with a name', () => {
    const state = emptyState();
    assert.equal(markDraw(state, choose(AUTUMN, '  Høstferie ')).ok, true);
    assert.deepEqual(state.draws[AUTUMN], { label: 'Høstferie', entries: [] });
    refused(state, book, as('Ola Nordmann', AUTUMN), /Det trekkes lodd om uke 45/);
  });

  test('a week that is booked, or already set up, cannot be', () => {
    const state = emptyState();
    book(state, as('Ola Nordmann', AUTUMN));
    refused(state, markDraw, choose(AUTUMN), /allerede booket av Ola Nordmann/);
    markDraw(state, choose('2026-W46'));
    refused(state, markDraw, choose('2026-W46'), /Det trekkes allerede lodd om uke 46/);
  });

  test('a week that is over or does not exist cannot be, nor one with a name that is too long', () => {
    const state = emptyState();
    refused(state, markDraw, choose('2026-W41'), /er over/);
    refused(state, markDraw, choose('ingen uke'), /finnes ikke/, 404);
    refused(state, markDraw, choose(AUTUMN, 'x'.repeat(41)), /40 tegn/, 400);
  });

  test('a draw nobody has entered can be made an ordinary week again', () => {
    const state = bookWithEaster();
    assert.equal(unmarkDraw(state, choose(EASTER)).ok, true);
    assert.equal(state.draws[EASTER], undefined);
    assert.equal(book(state, as('Ola Nordmann', EASTER)).ok, true);
  });

  test('a draw someone has entered, or that is done, stays a draw', () => {
    const state = bookWithEaster('Ola Nordmann');
    refused(state, unmarkDraw, choose(EASTER), /1 har meldt seg på/);
    drawWinner(state, { week: EASTER, today: TODAY, now: NOW });
    refused(state, unmarkDraw, choose(EASTER), /Trekningen om uke 12 er gjort/);
    refused(state, unmarkDraw, choose(AUTUMN), /Det trekkes ikke lodd om uke 45/);
  });
});

describe('the book as it is shown', () => {
  test('the calendar is the 52 weeks from this one, each with what stands about it', () => {
    const state = bookWithEaster('Kari Hansen');
    book(state, as('Ola Nordmann', AUTUMN));
    const weeks = calendar(state, TODAY);

    assert.equal(weeks.length, HORIZON);
    assert.equal(weeks[0].week, TODAY);
    assert.equal(weeks.at(-1).week, '2027-W40');
    assert.deepEqual(weeks[0], { week: TODAY, booking: null, draw: null, waiting: [] });
    assert.equal(weeks.find((entry) => entry.week === AUTUMN).booking.name, 'Ola Nordmann');
    assert.equal(weeks.find((entry) => entry.week === EASTER).draw.label, 'Påske');
  });

  test('a new book has Easter and the winter break set up for a draw', () => {
    const state = firstState(new Date('2026-10-11T12:00:00Z'));
    assert.deepEqual(state.bookings, {});
    assert.deepEqual(state.draws, {
      '2027-W08': { label: 'Vinterferie', entries: [] },
      '2027-W12': { label: 'Påske', entries: [] },
    });
  });

  test('a new book takes this year’s weeks while they are still ahead', () => {
    const state = firstState(new Date('2027-01-11T12:00:00Z'));
    assert.deepEqual(Object.keys(state.draws), ['2027-W08', '2027-W12']);
  });

  test('Easter is still ahead until twelve on Easter Saturday, when its week ends', () => {
    // Easter Saturday 2027 is 27 March, in winter time: twelve in Norway is 11:00 UTC.
    assert.deepEqual(Object.keys(firstState(new Date('2027-03-27T10:59:00Z')).draws), ['2028-W08', '2027-W12']);
    assert.deepEqual(Object.keys(firstState(new Date('2027-03-27T11:00:00Z')).draws), ['2028-W08']);
  });

  test('a new book leaves out an Easter that is more than 52 weeks away', () => {
    // The week after Easter 2027. Easter 2028 is in week 15, 54 weeks later.
    const state = firstState(new Date('2027-03-29T12:00:00Z'));
    assert.deepEqual(Object.keys(state.draws), ['2028-W08']);
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { emptyState } from '../src/cabin.js';
import { overviewText } from '../src/overview.js';

// Friday 16 October 2026 at nine in the morning in Norway. The week we are in ends at twelve today.
const FRIDAY = new Date('2026-10-16T07:00:00Z');
const AT = '2026-10-01T08:00:00.000Z';
const entered = (...names) => names.map((name) => ({ name, at: AT }));

function book() {
  return {
    bookings: {
      '2026-W42': { name: 'Nina Berg', at: AT },
      '2026-W43': { name: 'Ola Nordmann', at: AT },
      '2026-W45': { name: 'Kari Hansen', at: AT },
      '2026-W47': { name: 'Jonas Lie', at: AT },
    },
    draws: {
      '2026-W45': { label: 'Høstferie', entries: entered('Kari Hansen', 'Per Olsen') },
      '2026-W46': { label: '', entries: entered('Ola Nordmann', 'Kari Hansen', 'Per Olsen') },
    },
  };
}

describe('the overview sent out on Fridays', () => {
  test('says who has the cabin each of the next four weeks, ready to paste into an e-mail', () => {
    assert.equal(overviewText(book(), FRIDAY), [
      'Hei!',
      '',
      'Her er hvem som har hytta de neste fire ukene:',
      '',
      'Uke 43, fre. 16. – fre. 23. oktober: Ola Nordmann',
      'Uke 44, fre. 23. – fre. 30. oktober: ledig',
      'Uke 45 (Høstferie), fre. 30. oktober – fre. 6. november: Kari Hansen (vant trekningen)',
      'Uke 46, fre. 6. – fre. 13. november: trekning, ikke trukket ennå (3 påmeldte)',
      '',
      'Hytteuka går fra fredag til fredag. De som reiser, er ute til klokka 12, så vaskehjelpen rekker over før de neste kommer etter jobb.',
      '',
      'Ser du en ledig uke? Da er det bare å booke den i Hytteboka. God tur til alle som skal av gårde!',
    ].join('\n'));
  });

  test('invites people to book only when a week is free', () => {
    const state = emptyState();
    for (const week of ['2026-W43', '2026-W44', '2026-W45']) state.bookings[week] = { name: 'Ola Nordmann', at: AT };
    state.draws['2026-W46'] = { label: '', entries: [] };
    const text = overviewText(state, FRIDAY);

    assert.doesNotMatch(text, /Ser du en ledig uke/);
    assert.match(text, /\n\nGod tur til alle som skal av gårde!$/);
  });

  test('leaves out the week we are in, and the fifth week', () => {
    const text = overviewText(book(), FRIDAY);
    assert.doesNotMatch(text, /Uke 42|Nina Berg/);
    assert.doesNotMatch(text, /Uke 47|Jonas Lie/);
    assert.equal(text.match(/^Uke /gm).length, 4);
  });

  test('names nobody who is only entered in a draw', () => {
    assert.doesNotMatch(overviewText(book(), FRIDAY), /Per Olsen/);
  });

  test('says how many are in a draw that is not drawn yet', () => {
    const state = emptyState();
    state.draws['2026-W43'] = { label: 'Høstferie', entries: [] };
    state.draws['2026-W44'] = { label: '', entries: entered('Ola Nordmann') };
    const text = overviewText(state, FRIDAY);

    assert.match(text, /^Uke 43 \(Høstferie\), fre\. 16\. – fre\. 23\. oktober: trekning, ikke trukket ennå \(ingen påmeldt\)$/m);
    assert.match(text, /^Uke 44, fre\. 23\. – fre\. 30\. oktober: trekning, ikke trukket ennå \(1 påmeldt\)$/m);
  });

  test('an empty book gives four free weeks', () => {
    assert.equal(overviewText(emptyState(), FRIDAY).match(/: ledig$/gm).length, 4);
  });

  test('sent before twelve on a Friday it starts with the week that begins that day; after twelve, with the next', () => {
    // Friday 16 October 2026: twelve in Norway is 10:00 UTC.
    const before = overviewText(book(), new Date('2026-10-16T09:59:00Z'));
    const after = overviewText(book(), new Date('2026-10-16T10:00:00Z'));

    assert.equal(before, overviewText(book(), FRIDAY));
    assert.deepEqual(after.match(/^Uke \d+/gm), ['Uke 44', 'Uke 45', 'Uke 46', 'Uke 47']);
    assert.match(after, /^Uke 47, fre\. 13\. – fre\. 20\. november: Jonas Lie$/m);
  });

  test('Easter, which is one trip of two weeks, is one line with both its Fridays', () => {
    // Friday 12 March 2027, in the morning: the next four weeks are 11, 12, 13 and 14, and Easter is two of them.
    const beforeEaster = new Date('2027-03-12T08:00:00Z');
    const state = emptyState();
    state.draws['2027-W12'] = { label: 'Påske', entries: entered('Ola Nordmann', 'Kari Hansen') };
    state.bookings['2027-W14'] = { name: 'Per Olsen', at: AT };

    assert.deepEqual(overviewText(state, beforeEaster).match(/^Uke .*$/gm), [
      'Uke 11, fre. 12. – fre. 19. mars: ledig',
      'Uke 12 og 13 (Påske), fre. 19. mars – fre. 2. april: trekning, ikke trukket ennå (2 påmeldte)',
      'Uke 14, fre. 2. – fre. 9. april: Per Olsen',
    ]);

    state.bookings['2027-W12'] = { name: 'Kari Hansen', at: AT };
    assert.match(overviewText(state, beforeEaster), /^Uke 12 og 13 \(Påske\), fre\. 19\. mars – fre\. 2\. april: Kari Hansen \(vant trekningen\)$/m);
  });

  test('sent in Easter’s first week, it still has the whole trip as its first line', () => {
    // Friday 19 March 2027 at one o'clock: Easter has just begun, and its second week is the next of the four.
    const state = emptyState();
    state.draws['2027-W12'] = { label: 'Påske', entries: [] };
    state.bookings['2027-W12'] = { name: 'Kari Hansen', at: AT };

    assert.deepEqual(overviewText(state, new Date('2027-03-19T12:00:00Z')).match(/^Uke [^:]*/gm), [
      'Uke 12 og 13 (Påske), fre. 19. mars – fre. 2. april', 'Uke 14, fre. 2. – fre. 9. april',
      'Uke 15, fre. 9. – fre. 16. april', 'Uke 16, fre. 16. – fre. 23. april',
    ]);
  });

  test('the weeks run on across New Year', () => {
    // Friday 18 December 2026, in the morning.
    const text = overviewText(emptyState(), new Date('2026-12-18T08:00:00Z'));
    assert.deepEqual(text.match(/^Uke .*(?=: ledig$)/gm), [
      'Uke 52, fre. 18. – fre. 25. desember',
      'Uke 53, fre. 25. desember – fre. 1. januar',
      'Uke 1, fre. 1. – fre. 8. januar',
      'Uke 2, fre. 8. – fre. 15. januar',
    ]);
  });
});

describe('node overview.js', () => {
  const script = fileURLToPath(new URL('../overview.js', import.meta.url));
  const folder = mkdtempSync(join(tmpdir(), 'hytteboka-'));
  after(() => rmSync(folder, { recursive: true, force: true }));
  const run = (file) => spawnSync(process.execPath, [script, file], { encoding: 'utf8' });

  test('prints the overview of the book it is pointed at, as it is now', () => {
    const file = join(folder, 'bok.json');
    writeFileSync(file, JSON.stringify(book()));
    const result = run(file);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${overviewText(book())}\n`);
    assert.equal(result.stderr, '');
  });

  test('says so, and prints no overview, when there is no book', () => {
    const result = run(join(folder, 'ingen-bok.json'));

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Fant ikke boka/);
  });
});

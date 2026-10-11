import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { emptyState } from '../src/cabin.js';
import { overviewText } from '../src/overview.js';

// Friday 16 October 2026 at 14:00 in Norway. The week we are in ends the next day.
const FRIDAY = new Date('2026-10-16T12:00:00Z');
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
      'Uke 43, lør. 17. – lør. 24. oktober: Ola Nordmann',
      'Uke 44, lør. 24. – lør. 31. oktober: ledig',
      'Uke 45 (Høstferie), lør. 31. oktober – lør. 7. november: Kari Hansen (vant trekningen)',
      'Uke 46, lør. 7. – lør. 14. november: trekning, ikke trukket ennå (3 påmeldte)',
      '',
      'Hytteuka går fra lørdag til lørdag. De som reiser, er ute til klokka 12.',
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

    assert.match(text, /^Uke 43 \(Høstferie\), lør\. 17\. – lør\. 24\. oktober: trekning, ikke trukket ennå \(ingen påmeldt\)$/m);
    assert.match(text, /^Uke 44, lør\. 24\. – lør\. 31\. oktober: trekning, ikke trukket ennå \(1 påmeldt\)$/m);
  });

  test('an empty book gives four free weeks', () => {
    assert.equal(overviewText(emptyState(), FRIDAY).match(/: ledig$/gm).length, 4);
  });

  test('the four weeks are the same until twelve on Saturday, and move on from then', () => {
    // Saturday 17 October 2026: twelve in Norway is 10:00 UTC.
    const before = overviewText(book(), new Date('2026-10-17T09:59:00Z'));
    const after = overviewText(book(), new Date('2026-10-17T10:00:00Z'));

    assert.equal(before, overviewText(book(), FRIDAY));
    assert.deepEqual(after.match(/^Uke \d+/gm), ['Uke 44', 'Uke 45', 'Uke 46', 'Uke 47']);
    assert.match(after, /^Uke 47, lør\. 14\. – lør\. 21\. november: Jonas Lie$/m);
  });

  test('the weeks run on across New Year', () => {
    // Friday 18 December 2026.
    const text = overviewText(emptyState(), new Date('2026-12-18T12:00:00Z'));
    assert.deepEqual(text.match(/^Uke .*(?=: ledig$)/gm), [
      'Uke 52, lør. 19. – lør. 26. desember',
      'Uke 53, lør. 26. desember – lør. 2. januar',
      'Uke 1, lør. 2. – lør. 9. januar',
      'Uke 2, lør. 9. – lør. 16. januar',
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

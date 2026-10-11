// The server as people meet it: every request here goes over HTTP to a server on a port of its own,
// with a book in a folder of its own. It is Wednesday 14 October 2026, at twelve in Norway, in the week
// that runs from Friday 9 to Friday 16 October.

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { firstState } from '../src/cabin.js';
import { openStore } from '../src/store.js';

const NOW = new Date('2026-10-14T10:00:00Z');
const AUTUMN = '2026-W45';
const EASTER = '2027-W12';

let server;
let origin;
let file;
let now;

before(() => {
  server = createServer((request, response) => server.app(request, response));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

// Every test opens a new book, in a folder that is removed at the end.
const folders = [];
beforeEach(() => {
  folders.push(mkdtempSync(join(tmpdir(), 'hytteboka-')));
  file = join(folders.at(-1), 'bok.json');
  now = NOW;
  server.app = createApp({ store: openStore(file, () => firstState(NOW)), now: () => now });
});

after(() => {
  folders.forEach((folder) => rmSync(folder, { recursive: true, force: true }));
  return new Promise((resolve) => server.close(resolve));
});

/** One person's browser: it sends the name they typed with everything it asks for. */
function person(name) {
  const headers = name ? { Cookie: `navn=${encodeURIComponent(name)}` } : {};
  return {
    get: (path) => fetch(origin + path, { headers, redirect: 'manual' }),
    post: (path, form = {}, more = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: { ...headers, ...more },
        body: new URLSearchParams(form),
        redirect: 'manual',
      }),
  };
}

const ola = person('Ola Nordmann');
const kari = person('Kari Hansen');
const per = person('Per Olsen');
const visitor = person('');
const book = () => JSON.parse(readFileSync(file, 'utf8'));

/** The card of one week on the calendar, as text without tags. */
async function card(who, week) {
  const page = await (await who.get('/')).text();
  const found = new RegExp(`<li class="week[^>]*id="${week}">([\\s\\S]*?)</li>\\s*(?:<li class="week|</ul>)`).exec(page);
  assert.ok(found, `no card for ${week}`);
  return found[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('the calendar', () => {
  test('shows the 52 weeks from this one, with Easter and the winter break set up for a draw', async () => {
    const response = await visitor.get('/');
    const page = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(page.match(/<li class="week /g).length, 51, 'Easter’s two weeks are one card');
    assert.match(page, /<h2>Oktober 2026<\/h2>/);
    assert.match(await card(visitor, '2026-W42'), /^Uke 42 fre\. 9\. – fre\. 16\. oktober Denne uka Ledig$/);
    assert.match(await card(visitor, EASTER), /Uke 12 og 13 fre\. 19\. mars – fre\. 2\. april Trekning · Påske Ingen påmeldt ennå Se trekningen/);
    assert.match(await card(visitor, '2027-W08'), /Trekning · Vinterferie/);
  });

  test('asks who you are, and offers no buttons until it knows', async () => {
    const page = await (await visitor.get('/')).text();
    assert.match(page, /Hvem er du\?/);
    assert.doesNotMatch(page, /Book uka/);
    assert.match(await (await ola.get('/')).text(), /Book uka/);
  });

  test('remembers the name someone types, and forgets it when they ask', async () => {
    const typed = await visitor.post('/navn', { navn: '  Ola   Nordmann ' });
    assert.equal(typed.status, 303);
    assert.equal(typed.headers.get('location'), '/');
    assert.match(typed.headers.get('set-cookie'), /^navn=Ola%20Nordmann; Path=\/; Max-Age=31536000/);

    const page = await (await ola.get('/')).text();
    assert.match(page, /Du er <strong>Ola Nordmann<\/strong>/);
    assert.doesNotMatch(page, /Hvem er du\?/);

    const forgotten = await ola.post('/navn');
    assert.equal(forgotten.status, 303);
    assert.match(forgotten.headers.get('set-cookie'), /^navn=; Path=\/; Max-Age=0/);
  });

  test('turns away a name that is too long, and keeps what was typed', async () => {
    const response = await visitor.post('/navn', { navn: 'x'.repeat(61) });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
    const page = await response.text();
    assert.match(page, /Navnet kan være på 60 tegn/);
    assert.match(page, new RegExp(`value="${'x'.repeat(61)}"`));
  });
});

describe('the cabin week', () => {
  // Friday 16 October 2026, when the week of 9 to 16 October ends. Summer time: twelve in Norway is 10:00 UTC.
  const BEFORE_TWELVE = new Date('2026-10-16T09:59:00Z');
  const TWELVE = new Date('2026-10-16T10:00:00Z');

  test('the calendar says the rule: Friday to Friday, out by twelve for the cleaner, and the next come after work', async () => {
    const page = await (await visitor.get('/')).text();
    assert.match(page, /<p class="hero-rule">Hytteuka går fra fredag til fredag\. De som reiser, er ute til klokka 12, så vaskehjelpen rekker over før de neste kommer etter jobb\.<\/p>/);
  });

  test('a week ends on the Friday the next one starts', async () => {
    assert.match(await card(visitor, '2026-W42'), /^Uke 42 fre\. 9\. – fre\. 16\. oktober /);
    assert.match(await card(visitor, '2026-W43'), /^Uke 43 fre\. 16\. – fre\. 23\. oktober /);
    assert.match(await card(visitor, '2026-W44'), /^Uke 44 fre\. 23\. – fre\. 30\. oktober /);
  });

  test('until twelve on Friday the week that ends is still this week, and can be booked', async () => {
    now = BEFORE_TWELVE;
    assert.match(await card(visitor, '2026-W42'), /Denne uka Ledig$/);
    assert.equal((await ola.post('/uker/2026-W42/book')).status, 303);
  });

  test('from twelve on Friday the next week is this week, and the one that ended is over', async () => {
    now = TWELVE;
    const page = await (await visitor.get('/')).text();
    assert.doesNotMatch(page, /id="2026-W42"/);
    assert.equal(page.match(/<li class="week /g).length, 51, 'Easter’s two weeks are one card');
    assert.match(await card(visitor, '2026-W43'), /^Uke 43 fre\. 16\. – fre\. 23\. oktober Denne uka Ledig$/);

    const late = await ola.post('/uker/2026-W42/book');
    assert.equal(late.status, 409);
    assert.match(await late.text(), /role="alert">Uke 42 er over\./);
    assert.equal((await ola.post('/uker/2026-W43/book')).status, 303);
  });

  test('someone who has the week that ended cannot give it up after twelve', async () => {
    now = BEFORE_TWELVE;
    await ola.post('/uker/2026-W42/book');
    now = TWELVE;
    assert.equal((await ola.post('/uker/2026-W42/avbestill')).status, 409);
    assert.equal(book().bookings['2026-W42'].name, 'Ola Nordmann');
  });
});

// Ragnhild wrote that the page says the cabin is taken when one group leaves and the next arrives
// the same day. That was when the day was Saturday; it is Friday now, and these go through one:
// 16 October 2026, when
// Ola's week (10 to 17 October) ends and Kari's (17 to 24 October) starts.
describe('the Friday one group leaves and the next arrives', () => {
  const LEAVING = '2026-W42';
  const ARRIVING = '2026-W43';
  const MORNING = new Date('2026-10-16T08:30:00Z'); // 10:30 in Norway, before those who leave are out
  const AFTERNOON = new Date('2026-10-16T13:00:00Z'); // 15:00 in Norway: the cleaner's hours, before the next come

  test('the week that starts that Friday is free and can be booked, though the week that ends then is taken', async () => {
    await ola.post(`/uker/${LEAVING}/book`);

    assert.equal(await card(kari, LEAVING), 'Uke 42 fre. 9. – fre. 16. oktober Denne uka Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Ledig Book uka');

    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal(book().bookings[LEAVING].name, 'Ola Nordmann');
    assert.equal(book().bookings[ARRIVING].name, 'Kari Hansen');
  });

  test('it makes no difference which of the two weeks is booked first', async () => {
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal((await ola.post(`/uker/${LEAVING}/book`)).status, 303);
    assert.deepEqual(Object.keys(book().bookings).sort(), [LEAVING, ARRIVING]);
  });

  test('on the Friday morning the page shows both: those who leave have this week, those who arrive the next', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    await kari.post(`/uker/${ARRIVING}/book`);
    now = MORNING;

    assert.equal(await card(kari, LEAVING), 'Uke 42 fre. 9. – fre. 16. oktober Denne uka Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Du har hytta Si fra deg uka Legg i kalenderen din');
    assert.equal(await card(ola, LEAVING), 'Uke 42 fre. 9. – fre. 16. oktober Denne uka Du har hytta Si fra deg uka Legg i kalenderen din');
    assert.equal(await card(ola, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Booket av Kari Hansen Sett meg på venteliste');
  });

  test('on the Friday morning itself, the week that starts that day can still be booked', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    now = MORNING;

    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Ledig Book uka');
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Du har hytta Si fra deg uka Legg i kalenderen din');
  });

  test('after twelve the week of those who left is gone, and this week belongs to those who arrived', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    await kari.post(`/uker/${ARRIVING}/book`);
    now = AFTERNOON;

    assert.doesNotMatch(await (await kari.get('/')).text(), new RegExp(`id="${LEAVING}"`));
    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Denne uka Du har hytta Si fra deg uka Legg i kalenderen din');
    assert.equal(await card(ola, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Denne uka Booket av Kari Hansen Sett meg på venteliste');
  });

  test('after twelve the week that started that day is free for whoever comes, if nobody had booked it', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    now = AFTERNOON;

    assert.equal(await card(kari, ARRIVING), 'Uke 43 fre. 16. – fre. 23. oktober Denne uka Ledig Book uka');
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
  });

  test('the weeks on both sides of a week that was drawn can be booked', async () => {
    // The winter break, 19 to 26 February 2027, shares a Friday with the week before and the week after.
    for (const who of [ola, kari, per]) await who.post('/uker/2027-W08/meld-pa');
    await visitor.post('/trekning/2027-W08/trekk', { klar: 'ja' });
    const winner = book().bookings['2027-W08'].name;

    assert.equal((await person('Nina Berg').post('/uker/2027-W07/book')).status, 303);
    assert.equal((await person('Jonas Lie').post('/uker/2027-W09/book')).status, 303);
    assert.equal(book().bookings['2027-W08'].name, winner);
  });

  test('a winner can be drawn for a week whose neighbours are both taken', async () => {
    await person('Nina Berg').post('/uker/2027-W07/book');
    await person('Jonas Lie').post('/uker/2027-W09/book');
    await ola.post('/uker/2027-W08/meld-pa');

    assert.equal((await visitor.post('/trekning/2027-W08/trekk', { klar: 'ja' })).status, 303);
    assert.equal(book().bookings['2027-W08'].name, 'Ola Nordmann');
  });
});

describe('booking', () => {
  test('Ola books a free week, and everyone sees that it is his', async () => {
    const response = await ola.post(`/uker/${AUTUMN}/book`);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `/#${AUTUMN}`);

    assert.equal(await card(ola, AUTUMN), 'Uke 45 fre. 30. oktober – fre. 6. november Du har hytta Si fra deg uka Legg i kalenderen din');
    assert.equal(await card(kari, AUTUMN), 'Uke 45 fre. 30. oktober – fre. 6. november Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(visitor, AUTUMN), 'Uke 45 fre. 30. oktober – fre. 6. november Booket av Ola Nordmann');
    assert.equal(book().bookings[AUTUMN].name, 'Ola Nordmann');
  });

  test('Kari cannot book the week Ola has', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const response = await kari.post(`/uker/${AUTUMN}/book`);

    assert.equal(response.status, 409);
    assert.match(await response.text(), /role="alert">Uke 45 er allerede booket av Ola Nordmann\. Du kan sette deg på venteliste\./);
    assert.equal(book().bookings[AUTUMN].name, 'Ola Nordmann');
  });

  test('when two press at the same moment, one gets the week and the other is told who did', async () => {
    const answers = await Promise.all([ola.post(`/uker/${AUTUMN}/book`), kari.post(`/uker/${AUTUMN}/book`)]);
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [303, 409]);
    assert.equal(Object.keys(book().bookings).length, 1);
  });

  test('Ola gives the week up, and then Kari can have it', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    assert.equal((await kari.post(`/uker/${AUTUMN}/avbestill`)).status, 403);
    assert.equal((await ola.post(`/uker/${AUTUMN}/avbestill`)).status, 303);
    assert.match(await card(kari, AUTUMN), /Ledig Book uka$/);
    assert.equal((await kari.post(`/uker/${AUTUMN}/book`)).status, 303);
  });

  test('nobody books without a name, a week that is over, or a week that does not exist', async () => {
    const nameless = await visitor.post(`/uker/${AUTUMN}/book`);
    assert.equal(nameless.status, 400);
    assert.match(await nameless.text(), /Skriv navnet ditt først/);

    assert.equal((await ola.post('/uker/2026-W41/book')).status, 409);
    assert.equal((await ola.post('/uker/2027-W53/book')).status, 404);
    assert.equal((await ola.post('/uker/2026-W45/stjel')).status, 404);
    assert.deepEqual(book().bookings, {});
  });

  test('a week a winner is drawn for cannot be booked', async () => {
    const response = await ola.post(`/uker/${EASTER}/book`);
    assert.equal(response.status, 409);
    assert.match(await response.text(), /Det trekkes lodd om uke 12 og 13\. Meld deg på trekningen i stedet\./);
  });
});

// Ragnhild asked for a waiting list when the week is taken. Ola has the autumn week, 31 October to 7 November.
describe('the waiting list', () => {
  const WEEK = 'Uke 45 fre. 30. oktober – fre. 6. november';
  const nina = person('Nina Berg');
  beforeEach(() => ola.post(`/uker/${AUTUMN}/book`));

  /** What a card says, part by part. */
  const parts = (...words) => words.join(' ');

  /** How the card of the one who has the week starts. What else it offers them is not for these tests to say. */
  const startsWith = async (who, start) => assert.equal((await card(who, AUTUMN)).slice(0, start.length), start);

  /** What the top of the calendar tells someone about a week they got from the waiting list, or null. */
  async function notice(who) {
    const found = /<p class="notice">([\s\S]*?)<\/p>/.exec(await (await who.get('/')).text());
    return found && found[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  test('Kari puts herself on the waiting list for the week Ola has, and everyone sees it', async () => {
    assert.equal(await card(kari, AUTUMN), `${WEEK} Booket av Ola Nordmann Sett meg på venteliste`);

    const response = await kari.post(`/uker/${AUTUMN}/vent`);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `/#${AUTUMN}`);
    assert.deepEqual(book().waiting[AUTUMN], [{ name: 'Kari Hansen', at: NOW.toISOString() }]);

    assert.equal(await card(kari, AUTUMN), parts(
      WEEK, 'Booket av Ola Nordmann', 'Du står først på ventelista',
      'På venteliste: Kari Hansen', 'Sier Ola Nordmann fra seg uka, går den til deg.', 'Ta meg av ventelista',
    ));
    assert.equal(await card(per, AUTUMN), parts(
      WEEK, 'Booket av Ola Nordmann',
      'På venteliste: Kari Hansen', 'Sier Ola Nordmann fra seg uka, går den til Kari Hansen.', 'Sett meg på venteliste',
    ));
    assert.equal(await card(visitor, AUTUMN), parts(
      WEEK, 'Booket av Ola Nordmann',
      'På venteliste: Kari Hansen', 'Sier Ola Nordmann fra seg uka, går den til Kari Hansen.',
    ));
  });

  test('the one who has the week sees who waits, and who gets it if he gives it up', async () => {
    await kari.post(`/uker/${AUTUMN}/vent`);
    await per.post(`/uker/${AUTUMN}/vent`);

    await startsWith(ola, parts(
      WEEK, 'Du har hytta',
      'På venteliste: Kari Hansen Per Olsen', 'Sier du fra seg uka, går den til Kari Hansen.', 'Si fra deg uka',
    ));
    const page = await (await ola.get('/')).text();
    assert.match(page, /<ol>\s*<li>Kari Hansen<\/li><li>Per Olsen<\/li>\s*<\/ol>/, 'in the order they came');
  });

  test('the second to come is told their place', async () => {
    await kari.post(`/uker/${AUTUMN}/vent`);
    await per.post(`/uker/${AUTUMN}/vent`);
    assert.equal(await card(per, AUTUMN), parts(
      WEEK, 'Booket av Ola Nordmann', 'Du er nummer 2 på ventelista',
      'På venteliste: Kari Hansen Per Olsen', 'Sier Ola Nordmann fra seg uka, går den til Kari Hansen.', 'Ta meg av ventelista',
    ));
  });

  test('when Ola gives the week up it is Kari’s, and Per is first', async () => {
    await kari.post(`/uker/${AUTUMN}/vent`);
    await per.post(`/uker/${AUTUMN}/vent`);
    now = new Date('2026-10-20T07:30:00Z');

    assert.equal((await ola.post(`/uker/${AUTUMN}/avbestill`)).status, 303);
    assert.deepEqual(book().bookings[AUTUMN], {
      name: 'Kari Hansen', at: '2026-10-20T07:30:00.000Z', after: 'Ola Nordmann',
    });
    assert.deepEqual(book().waiting[AUTUMN].map((entry) => entry.name), ['Per Olsen']);

    await startsWith(kari, parts(
      WEEK, 'Du har hytta', 'Fra ventelista, etter Ola Nordmann',
      'På venteliste: Per Olsen', 'Sier du fra seg uka, går den til Per Olsen.', 'Si fra deg uka',
    ));
    assert.equal(await card(per, AUTUMN), parts(
      WEEK, 'Booket av Kari Hansen', 'Du står først på ventelista',
      'På venteliste: Per Olsen', 'Sier Kari Hansen fra seg uka, går den til deg.', 'Ta meg av ventelista',
    ));
    assert.equal(await card(ola, AUTUMN), parts(
      WEEK, 'Booket av Kari Hansen',
      'På venteliste: Per Olsen', 'Sier Kari Hansen fra seg uka, går den til Per Olsen.', 'Sett meg på venteliste',
    ));
  });

  test('the one who got the week is told so at the top of the calendar, and nobody else is', async () => {
    await kari.post(`/uker/${AUTUMN}/vent`);
    await ola.post(`/uker/${AUTUMN}/avbestill`);

    assert.equal(await notice(kari), parts(
      'Du har fått uke 45, fre. 30. oktober – fre. 6. november 2026.',
      'Du sto først på ventelista da Ola Nordmann sa fra seg uka.',
      'Passer den ikke lenger, sier du den fra deg.',
    ));
    assert.match(await (await kari.get('/')).text(), /Du har fått <a href="#2026-W45">uke 45<\/a>/, 'with a way to the week');
    for (const other of [ola, per, visitor]) assert.equal(await notice(other), null);

    await kari.post(`/uker/${AUTUMN}/avbestill`);
    assert.equal(await notice(kari), null, 'not when she has given it up');
    assert.match(await card(kari, AUTUMN), /Ledig Book uka$/);
  });

  test('a week someone booked themselves has no such word', async () => {
    assert.equal(await notice(ola), null);
    await startsWith(ola, `${WEEK} Du har hytta Si fra deg uka`);
  });

  test('Kari takes herself off the waiting list, and then Ola’s week is free when he gives it up', async () => {
    await kari.post(`/uker/${AUTUMN}/vent`);
    assert.equal((await kari.post(`/uker/${AUTUMN}/ikke-vent`)).status, 303);
    assert.equal(await card(kari, AUTUMN), `${WEEK} Booket av Ola Nordmann Sett meg på venteliste`);
    assert.deepEqual(book().waiting, {});

    await ola.post(`/uker/${AUTUMN}/avbestill`);
    assert.equal(await card(kari, AUTUMN), `${WEEK} Ledig Book uka`);
  });

  test('says why someone cannot wait, or stop waiting', async () => {
    const mine = await ola.post(`/uker/${AUTUMN}/vent`);
    assert.equal(mine.status, 409);
    assert.match(await mine.text(), /role="alert">Du har allerede uke 45\./);

    await kari.post(`/uker/${AUTUMN}/vent`);
    const twice = await kari.post(`/uker/${AUTUMN}/vent`);
    assert.equal(twice.status, 409);
    assert.match(await twice.text(), /role="alert">Du står allerede på ventelista for uke 45\./);

    const free = await kari.post('/uker/2026-W46/vent');
    assert.equal(free.status, 409);
    assert.match(await free.text(), /role="alert">Uke 46 er ledig\. Book den i stedet\./);

    const draw = await kari.post(`/uker/${EASTER}/vent`);
    assert.equal(draw.status, 409);
    assert.match(await draw.text(), /role="alert">Det trekkes lodd om uke 12 og 13\. Meld deg på trekningen i stedet\./);

    const nameless = await visitor.post(`/uker/${AUTUMN}/vent`);
    assert.equal(nameless.status, 400);
    assert.match(await nameless.text(), /Skriv navnet ditt først/);

    const notWaiting = await per.post(`/uker/${AUTUMN}/ikke-vent`);
    assert.equal(notWaiting.status, 409);
    assert.match(await notWaiting.text(), /role="alert">Du står ikke på ventelista for uke 45\./);

    assert.equal((await kari.post('/uker/2026-W41/vent')).status, 409);
    assert.equal((await kari.post('/uker/2027-W53/vent')).status, 404);
    assert.deepEqual(book().waiting, { [AUTUMN]: [{ name: 'Kari Hansen', at: NOW.toISOString() }] });
  });

  test('when two press at the same moment, both wait, one behind the other', async () => {
    const answers = await Promise.all([kari.post(`/uker/${AUTUMN}/vent`), per.post(`/uker/${AUTUMN}/vent`)]);
    assert.deepEqual(answers.map((answer) => answer.status), [303, 303]);
    assert.deepEqual(book().waiting[AUTUMN].map((entry) => entry.name).sort(), ['Kari Hansen', 'Per Olsen']);
  });

  test('when Ola gives the week up as Kari asks to wait for it, she gets it or is told that it is free', async () => {
    const [gaveUp, asked] = await Promise.all([ola.post(`/uker/${AUTUMN}/avbestill`), kari.post(`/uker/${AUTUMN}/vent`)]);
    assert.equal(gaveUp.status, 303);

    if (asked.status === 303) {
      assert.equal(book().bookings[AUTUMN].name, 'Kari Hansen');
    } else {
      assert.equal(asked.status, 409);
      assert.match(await asked.text(), /role="alert">Uke 45 er ledig\. Book den i stedet\./);
      assert.equal(book().bookings[AUTUMN], undefined);
    }
    assert.deepEqual(book().waiting, {});
  });

  test('a week that was drawn has no waiting list', async () => {
    await nina.post(`/uker/${EASTER}/meld-pa`);
    await visitor.post(`/trekning/${EASTER}/trekk`, { klar: 'ja' });

    assert.equal(await card(kari, EASTER), 'Uke 12 og 13 fre. 19. mars – fre. 2. april Trekning · Påske Nina Berg vant trekningen Se trekningen');
    const response = await kari.post(`/uker/${EASTER}/vent`);
    assert.equal(response.status, 409);
    assert.match(
      await response.text(),
      /role="alert">Det er trukket lodd om uke 12 og 13\. Sier Nina Berg den fra seg, trekkes det på nytt blant de andre som var påmeldt\./,
    );
  });

  test('the week we are in has a waiting list until it is over', async () => {
    await ola.post('/uker/2026-W42/book');
    assert.equal((await kari.post('/uker/2026-W42/vent')).status, 303);

    now = new Date('2026-10-16T10:00:00Z'); // Friday at twelve, when the week ends
    const late = await per.post('/uker/2026-W42/vent');
    assert.equal(late.status, 409);
    assert.match(await late.text(), /role="alert">Uke 42 er over\./);
    assert.equal((await kari.post('/uker/2026-W42/ikke-vent')).status, 409);
  });

  test('a name on the waiting list is shown as it was typed, never read as markup', async () => {
    const rascal = person('<img src=x onerror=alert(1)>');
    await rascal.post(`/uker/${AUTUMN}/vent`);
    assert.doesNotMatch(await (await kari.get('/')).text(), /<img src=x/);
    assert.match(await (await kari.get('/')).text(), /<li>&lt;img src=x onerror=alert\(1\)&gt;<\/li>/);

    // Then the rascal has the week, and gives it up to Kari, who is told from whom.
    await ola.post(`/uker/${AUTUMN}/avbestill`);
    await kari.post(`/uker/${AUTUMN}/vent`);
    await rascal.post(`/uker/${AUTUMN}/avbestill`);
    const page = await (await kari.get('/')).text();
    assert.doesNotMatch(page, /<img src=x/);
    assert.match(page, /da <span class="person">&lt;img src=x onerror=alert\(1\)&gt;<\/span> sa fra seg uka/);
    assert.match(page, /Fra ventelista, etter &lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test('a book from before the waiting list is shown, and gets one when someone waits', async () => {
    writeFileSync(file, JSON.stringify({ bookings: { [AUTUMN]: { name: 'Ola Nordmann', at: NOW.toISOString() } }, draws: {} }));
    server.app = createApp({ store: openStore(file, () => assert.fail('the book is there')), now: () => now });

    assert.equal(await card(kari, AUTUMN), `${WEEK} Booket av Ola Nordmann Sett meg på venteliste`);
    assert.equal((await kari.post(`/uker/${AUTUMN}/vent`)).status, 303);
    assert.equal((await ola.post(`/uker/${AUTUMN}/avbestill`)).status, 303);
    assert.equal(book().bookings[AUTUMN].name, 'Kari Hansen');
  });
});

describe('the draw', () => {
  const enterAll = async () => {
    for (const who of [ola, kari, per]) {
      assert.equal((await who.post(`/uker/${EASTER}/meld-pa`)).status, 303);
    }
  };
  const draw = (form = { klar: 'ja' }, headers = { Accept: 'application/json' }) =>
    visitor.post(`/trekning/${EASTER}/trekk`, form, headers);

  test('those who want Easter enter, and can leave again', async () => {
    await enterAll();
    assert.match(await card(ola, EASTER), /3 påmeldte Du er med i trekningen Meld meg av Se trekningen$/);
    assert.match(await card(person('Nina Berg'), EASTER), /3 påmeldte Meld meg på Se trekningen$/);

    assert.equal((await ola.post(`/uker/${EASTER}/meld-pa`)).status, 409);
    assert.equal((await ola.post(`/uker/${EASTER}/meld-av`)).status, 303);
    assert.match(await card(ola, EASTER), /2 påmeldte Meld meg på/);
  });

  test('the draw page shows a ticket for each, and the button', async () => {
    await enterAll();
    const response = await visitor.get(`/trekning/${EASTER}`);
    const page = await response.text();

    assert.equal(response.status, 200);
    assert.match(page, /<h1>Påske<\/h1>/);
    assert.match(page, /Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027/);
    assert.deepEqual(
      [...page.matchAll(/<li class="ticket" data-ticket>([^<]*)<\/li>/g)].map((found) => found[1]),
      ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'],
    );
    assert.match(page, /3 lodd i hatten/);
    assert.match(page, /Trekk vinneren/);
    assert.match(page, /<section class="winner" data-winner tabindex="-1" hidden>/);
    assert.match(page, /<script type="module" src="\/trekning\.js">/);
  });

  test('the winner is one of those who entered, gets the week, and is drawn once', async () => {
    await enterAll();
    const response = await draw();
    const drawn = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(drawn.entries, ['Ola Nordmann', 'Kari Hansen', 'Per Olsen']);
    assert.ok([0, 1, 2].includes(drawn.winner));
    const winner = drawn.entries[drawn.winner];
    assert.equal(book().bookings[EASTER].name, winner);

    assert.match(await card(visitor, EASTER), new RegExp(`${winner} vant trekningen Se trekningen$`));
    assert.match(await card(person(winner), EASTER), /Du vant trekningen! Si fra deg turen Legg i kalenderen din Se trekningen$/);

    const page = await (await visitor.get(`/trekning/${EASTER}`)).text();
    assert.match(page, new RegExp(`<p class="winner-name" data-winner-name>${winner}</p>`));
    assert.match(page, /Trukket 14\. oktober 2026 kl\. 12[:.]00 blant 3 påmeldte\./);
    assert.match(page, new RegExp(`<li class="ticket is-winner" data-ticket>${winner}</li>`));
    assert.doesNotMatch(page, /Trekk vinneren/);

    const again = await draw();
    assert.equal(again.status, 409);
    assert.match((await again.json()).message, new RegExp(`Trekningen om uke 12 og 13 er gjort\\. Turen gikk til ${winner}\\.`));
    assert.equal(book().bookings[EASTER].name, winner);
    assert.equal((await person('Nina Berg').post(`/uker/${EASTER}/meld-pa`)).status, 409);
  });

  test('without scripts the button leads to the page that names the winner', async () => {
    await enterAll();
    const response = await draw({ klar: 'ja' }, {});
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `/trekning/${EASTER}`);
    const page = await (await visitor.get(`/trekning/${EASTER}`)).text();
    assert.match(page, new RegExp(`data-winner-name>${book().bookings[EASTER].name}<`));
  });

  test('nothing is drawn until the box is ticked, or before someone has entered', async () => {
    assert.equal((await draw()).status, 409);

    await enterAll();
    const unticked = await draw({}, {});
    assert.equal(unticked.status, 400);
    assert.match(await unticked.text(), /Kryss av for at alle som skal se på, er her\./);
    assert.equal((await draw({})).status, 400);
    assert.deepEqual(book().bookings, {});
  });

  test('a winner who gives the week up opens the draw again for the others', async () => {
    await enterAll();
    const first = await (await draw()).json();
    const winner = first.entries[first.winner];

    assert.equal((await person(winner).post(`/uker/${EASTER}/avbestill`)).status, 303);
    const second = await (await draw()).json();

    assert.equal(second.entries.length, 2);
    assert.ok(!second.entries.includes(winner));
  });

  test('there is no draw page for an ordinary week, or for no week', async () => {
    assert.equal((await visitor.get(`/trekning/${AUTUMN}`)).status, 404);
    assert.equal((await visitor.get('/trekning/tull')).status, 404);
    assert.equal((await visitor.post(`/trekning/${AUTUMN}/trekk`, { klar: 'ja' })).status, 404);
  });
});

// Ragnhild's rule: whoever wins a draw cannot win another week the same year.
describe('nobody wins two weeks in the same year', () => {
  const WINTER = '2027-W08';
  const everyone = ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'];
  const enterBoth = async () => {
    for (const name of everyone) {
      await person(name).post(`/uker/${WINTER}/meld-pa`);
      await person(name).post(`/uker/${EASTER}/meld-pa`);
    }
  };
  const draw = async (week) => {
    const response = await visitor.post(`/trekning/${week}/trekk`, { klar: 'ja' }, { Accept: 'application/json' });
    const drawn = await response.json();
    return drawn.entries[drawn.winner];
  };
  const tickets = async (week) => {
    const page = await (await visitor.get(`/trekning/${week}`)).text();
    return [...page.matchAll(/data-ticket>([^<]*)</g)].map((found) => found[1]);
  };

  test('the draw page says the rule', async () => {
    await enterBoth();
    assert.match(await (await visitor.get(`/trekning/${EASTER}`)).text(), /3 lodd i hatten\. Ingen vinner to uker samme år\./);
  });

  test('whoever wins the winter break is out of the Easter draw, which goes to one of the others', async () => {
    await enterBoth();
    assert.deepEqual(await tickets(EASTER), everyone);

    const winner = await draw(WINTER);
    const others = everyone.filter((name) => name !== winner);
    assert.deepEqual(await tickets(EASTER), others);
    assert.match(await card(person(others[0]), EASTER), /2 påmeldte Du er med i trekningen Meld meg av Se trekningen$/);

    assert.ok(others.includes(await draw(EASTER)));
    assert.notEqual(book().bookings[EASTER].name, book().bookings[WINTER].name);
  });

  test('the winner is told why, and is not offered the other draw that year', async () => {
    await enterBoth();
    const winner = person(await draw(WINTER));

    assert.equal(
      await card(winner, EASTER),
      'Uke 12 og 13 fre. 19. mars – fre. 2. april Trekning · Påske 2 påmeldte Du vant uke 8, og kan ikke vinne en uke til i 2027 Se trekningen',
    );
    const again = await winner.post(`/uker/${EASTER}/meld-pa`);
    assert.equal(again.status, 409);
    assert.match(await again.text(), /role="alert">Du vant uke 8, og kan ikke vinne en uke til i 2027\./);
    assert.equal(book().draws[EASTER].entries.length, 2);
  });

  test('a draw for a week in another year is still open to the winner', async () => {
    await visitor.post('/kontorsjef/trekningsuker', { uke: '2026-W52', navn: 'Jul' });
    await enterBoth();
    const winner = person(await draw(WINTER));

    assert.match(await card(winner, '2026-W52'), /Trekning · Jul Ingen påmeldt ennå Meld meg på Se trekningen$/);
    assert.equal((await winner.post('/uker/2026-W52/meld-pa')).status, 303);
  });

  test('a winner who gives the week up can enter the other draw again', async () => {
    await enterBoth();
    const winner = person(await draw(WINTER));
    assert.equal((await winner.post(`/uker/${WINTER}/avbestill`)).status, 303);

    assert.match(await card(winner, EASTER), /2 påmeldte Meld meg på Se trekningen$/);
    assert.equal((await winner.post(`/uker/${EASTER}/meld-pa`)).status, 303);
    assert.match(await card(winner, EASTER), /3 påmeldte Du er med i trekningen Meld meg av Se trekningen$/);
  });

  test('the winner can still book an ordinary week', async () => {
    await enterBoth();
    const winner = person(await draw(WINTER));
    assert.equal((await winner.post(`/uker/${AUTUMN}/book`)).status, 303);
    assert.equal((await winner.post('/uker/2027-W20/book')).status, 303);
  });
});

describe('for the office manager', () => {
  test('lists the draws, with who has entered', async () => {
    await ola.post(`/uker/${EASTER}/meld-pa`);
    await kari.post(`/uker/${EASTER}/meld-pa`);
    const page = await (await visitor.get('/kontorsjef')).text();

    assert.match(page, /<strong>Påske<\/strong>\s*<span>Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027<\/span>/);
    assert.match(page, /2 påmeldte: <span class="person">Ola Nordmann, Kari Hansen<\/span>/);
    assert.match(page, new RegExp(`href="/trekning/${EASTER}">Åpne trekningen`));
    assert.match(page, /<option value="2026-W45">Uke 45 · fre\. 30\. oktober – fre\. 6\. november 2026<\/option>/);
    assert.doesNotMatch(page, /<option value="2027-W12">/, 'a week that is set up is not offered again');
  });

  test('sets a week up for a draw, and makes it an ordinary week again while nobody has entered', async () => {
    const made = await visitor.post('/kontorsjef/trekningsuker', { uke: AUTUMN, navn: 'Høstferie' });
    assert.equal(made.status, 303);
    assert.equal(made.headers.get('location'), '/kontorsjef');
    assert.match(await card(ola, AUTUMN), /Trekning · Høstferie Ingen påmeldt ennå Meld meg på/);
    assert.equal((await ola.post(`/uker/${AUTUMN}/book`)).status, 409);

    assert.equal((await visitor.post(`/kontorsjef/trekningsuker/${AUTUMN}/fjern`)).status, 303);
    assert.match(await card(ola, AUTUMN), /Ledig Book uka$/);
  });

  test('says why a week cannot be set up, or cannot be made ordinary', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const booked = await visitor.post('/kontorsjef/trekningsuker', { uke: AUTUMN });
    assert.equal(booked.status, 409);
    assert.match(await booked.text(), /role="alert">Uke 45 er allerede booket av Ola Nordmann/);

    await kari.post(`/uker/${EASTER}/meld-pa`);
    const entered = await visitor.post(`/kontorsjef/trekningsuker/${EASTER}/fjern`);
    assert.equal(entered.status, 409);
    assert.match(await entered.text(), /1 har meldt seg på trekningen om uke 12 og 13/);

    assert.equal((await visitor.post('/kontorsjef/trekningsuker', {})).status, 404);
  });
});

// Ragnhild asked that people get their booking into their calendar: the one they keep themselves,
// in Outlook or on the phone. Whoever has a week is handed it as a file such a calendar reads.
describe('the booking in your own calendar', () => {
  const FILE = `/uker/${AUTUMN}/kalender.ics`;
  const link = (week) => new RegExp(`<a href="/uker/${week}/kalender\\.ics">Legg i kalenderen din</a>`);
  /** The lines of a calendar file, by name, with lines that were broken put together again. */
  const lines = (file) =>
    Object.fromEntries(file.replace(/\r\n /g, '').split('\r\n').map((line) => line.split(/:(.*)/s).slice(0, 2)));

  test('Ola books a week and finds the way to his calendar on it; nobody else is offered it', async () => {
    assert.doesNotMatch(await (await ola.get('/')).text(), /kalender\.ics/, 'nothing to fetch before he has a week');
    await ola.post(`/uker/${AUTUMN}/book`);

    assert.equal(await card(ola, AUTUMN), 'Uke 45 fre. 30. oktober – fre. 6. november Du har hytta Si fra deg uka Legg i kalenderen din');
    const page = await (await ola.get('/')).text();
    assert.match(page, link(AUTUMN));
    assert.equal(page.match(/kalender\.ics/g).length, 1, 'only on the week that is his');

    assert.doesNotMatch(await (await kari.get('/')).text(), /kalender\.ics/);
    assert.doesNotMatch(await (await visitor.get('/')).text(), /kalender\.ics/);
  });

  test('what he fetches is a calendar file, named after the week, that the browser saves', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const response = await ola.get(FILE);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="hytta-2026-uke-45.ics"');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const file = await response.text();
    assert.ok(file.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(file.endsWith('END:VCALENDAR\r\n'));
  });

  test('the event in it is his week: from after work on Friday 30 October to twelve on Friday 6 November', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const event = lines(await (await ola.get(FILE)).text());

    // Winter time: twelve in Norway is 11:00 UTC.
    assert.equal(event.DTSTART, '20261030T150000Z', 'four in the afternoon in Norway, in winter time');
    assert.equal(event.DTEND, '20261106T110000Z', 'twelve in Norway');
    assert.equal(event.SUMMARY, 'Firmahytta\\, uke 45');
    assert.match(event.DESCRIPTION, /^Ola Nordmann har firmahytta denne uka\./);
    assert.match(event.DESCRIPTION, /Hytteuka går fra fredag til fredag\. De som reiser\\, er ute til klokka 12\\, så vaskehjelpen rekker over før de neste kommer etter jobb\./);
    assert.equal(event.DTSTAMP, '20261014T100000Z', 'when he booked');
  });

  test('fetching it again gives the same event, so a calendar that has it need not get it twice', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const first = await (await ola.get(FILE)).text();
    assert.ok(first.startsWith('BEGIN:VCALENDAR\r\n'));
    now = new Date('2026-10-20T07:00:00Z');
    assert.equal(await (await ola.get(FILE)).text(), first);
  });

  test('the week someone won in a draw goes in their calendar the same way', async () => {
    await ola.post(`/uker/${EASTER}/meld-pa`);
    assert.doesNotMatch(await (await ola.get('/')).text(), /kalender\.ics/, 'entering a draw is not having the week');
    assert.equal((await ola.get(`/uker/${EASTER}/kalender.ics`)).status, 404);

    await visitor.post(`/trekning/${EASTER}/trekk`, { klar: 'ja' });
    assert.match(await card(ola, EASTER), /Du vant trekningen! Si fra deg turen Legg i kalenderen din Se trekningen$/);
    assert.match(await (await ola.get('/')).text(), link(EASTER));

    // Easter is one trip of two weeks, and one event. The clock is set forward on 28 March 2027,
    // inside it: it starts in winter time and ends in summer time.
    const event = lines(await (await ola.get(`/uker/${EASTER}/kalender.ics`)).text());
    assert.equal(event.DTSTART, '20270319T150000Z', 'four in the afternoon on Friday 19 March');
    assert.equal(event.DTEND, '20270402T100000Z', 'twelve on Friday 2 April');
    assert.equal(event.SUMMARY, 'Firmahytta\\, uke 12 og 13');
  });

  test('a week Ola gives up with nobody waiting has no file any more, and is another event when Kari books it', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const his = lines(await (await ola.get(FILE)).text());
    await ola.post(`/uker/${AUTUMN}/avbestill`);

    assert.equal((await ola.get(FILE)).status, 404);
    assert.doesNotMatch(await (await ola.get('/')).text(), /kalender\.ics/);

    await kari.post(`/uker/${AUTUMN}/book`);
    const hers = lines(await (await kari.get(FILE)).text());
    assert.notEqual(hers.UID, his.UID);
    assert.match(hers.DESCRIPTION, /^Kari Hansen har firmahytta denne uka\./);
    assert.doesNotMatch(await (await ola.get('/')).text(), /kalender\.ics/, 'the week is hers now');
  });

  test('the file says whose week it is to whoever fetches it, as the calendar page does', async () => {
    // There is no login, so the address answers anyone. Only the one who has the week is shown it.
    await ola.post(`/uker/${AUTUMN}/book`);
    const event = lines(await (await visitor.get(FILE)).text());
    assert.match(event.DESCRIPTION, /^Ola Nordmann har firmahytta denne uka\./);
  });

  test('there is no file for a free week, a week that does not exist, or anything else under a week', async () => {
    for (const path of [FILE, '/uker/2027-W53/kalender.ics', '/uker/tull/kalender.ics', `/uker/${AUTUMN}/kalender`, `/uker/${AUTUMN}`]) {
      const response = await ola.get(path);
      assert.equal(response.status, 404, path);
      assert.match(response.headers.get('content-type'), /text\/html/, path);
    }
  });

  test('fetching the file changes nothing in the book, and cannot be done with a post', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const before = readFileSync(file, 'utf8');
    assert.equal((await ola.get(FILE)).status, 200);
    assert.equal((await ola.post(FILE)).status, 404);
    assert.equal(readFileSync(file, 'utf8'), before);
  });

  test('a name with signs the calendar format uses for itself is still read as one name', async () => {
    const rascal = person('Hansen, Kari; \\n END:VEVENT');
    await rascal.post(`/uker/${AUTUMN}/book`);
    const text = await (await rascal.get(FILE)).text();

    assert.equal(text.match(/^END:VEVENT\r$/gm).length, 1);
    assert.match(lines(text).DESCRIPTION, /^Hansen\\, Kari\\; \\\\n END:VEVENT har firmahytta denne uka\./);
  });
});

// Where the waiting list and the calendar file meet. The two were built apart: a week now comes to
// someone without their booking it, and a week that is given up may have a new owner at once.
describe('a week from the waiting list, in your own calendar', () => {
  const FILE = `/uker/${AUTUMN}/kalender.ics`;
  const WEEK = 'Uke 45 fre. 30. oktober – fre. 6. november';
  const GIVEN_UP = new Date('2026-10-20T07:30:00Z');
  /** The lines of a calendar file, by name, with lines that were broken put together again. */
  const lines = (text) =>
    Object.fromEntries(text.replace(/\r\n /g, '').split('\r\n').map((line) => line.split(/:(.*)/s).slice(0, 2)));
  const event = async (who) => lines(await (await who.get(FILE)).text());
  /** The weeks someone is offered for their calendar. */
  const offered = async (who) =>
    [...(await (await who.get('/')).text()).matchAll(/href="\/uker\/([^"/]+)\/kalender\.ics"/g)].map((found) => found[1]);

  /** Ola has the week, Kari and Per wait for it in that order, and six days later Ola gives it up. */
  const olaGivesTheWeekToKari = async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    await kari.post(`/uker/${AUTUMN}/vent`);
    await per.post(`/uker/${AUTUMN}/vent`);
    now = GIVEN_UP;
    assert.equal((await ola.post(`/uker/${AUTUMN}/avbestill`)).status, 303);
  };

  test('someone who waits for a week is not offered it for their calendar', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    await kari.post(`/uker/${AUTUMN}/vent`);

    assert.deepEqual(await offered(ola), [AUTUMN]);
    assert.deepEqual(await offered(kari), []);
  });

  test('the one who gets the week from the waiting list finds the way to her calendar on it', async () => {
    await olaGivesTheWeekToKari();

    assert.equal(await card(kari, AUTUMN), [
      WEEK, 'Du har hytta', 'Fra ventelista, etter Ola Nordmann',
      'På venteliste: Per Olsen', 'Sier du fra seg uka, går den til Per Olsen.',
      'Si fra deg uka', 'Legg i kalenderen din',
    ].join(' '));
    assert.deepEqual(await offered(kari), [AUTUMN]);
  });

  test('the one who gave the week up, and the one still waiting, are not offered it', async () => {
    await olaGivesTheWeekToKari();

    assert.deepEqual(await offered(ola), []);
    assert.deepEqual(await offered(per), []);
    assert.doesNotMatch(await card(ola, AUTUMN), /kalender/i);
  });

  test('the file is hers: her name, an event of its own, made the moment the week came to her', async () => {
    await ola.post(`/uker/${AUTUMN}/book`);
    const his = await event(ola);
    await olaGivesTheWeekToKari();
    const hers = await event(kari);

    assert.match(hers.DESCRIPTION, /^Kari Hansen har firmahytta denne uka\./);
    assert.doesNotMatch(hers.DESCRIPTION, /Ola Nordmann/);
    assert.notEqual(hers.UID, his.UID, 'a calendar that has his event takes hers as another');
    assert.equal(his.DTSTAMP, '20261014T100000Z', 'his was made when he booked');
    assert.equal(hers.DTSTAMP, '20261020T073000Z', 'hers when he gave the week up');
    assert.deepEqual([hers.DTSTART, hers.DTEND, hers.SUMMARY], [his.DTSTART, his.DTEND, his.SUMMARY], 'the week is the same');
    assert.equal((await kari.get(FILE)).headers.get('content-disposition'), 'attachment; filename="hytta-2026-uke-45.ics"');
  });

  test('a week given up with someone waiting still has a file, and it is the new owner’s', async () => {
    // With nobody waiting the address answers 404 after the week is given up. Here it never does:
    // the week has an owner the whole time, and the file follows the week, not the one who asks.
    await olaGivesTheWeekToKari();

    const response = await ola.get(FILE);
    assert.equal(response.status, 200);
    assert.match(lines(await response.text()).DESCRIPTION, /^Kari Hansen har firmahytta denne uka\./);
  });

  test('when she gives it up in turn, the link and the file are the next one’s', async () => {
    await olaGivesTheWeekToKari();
    const hers = await event(kari);
    now = new Date('2026-10-21T09:00:00Z');
    await kari.post(`/uker/${AUTUMN}/avbestill`);

    const his = await event(per);
    assert.match(his.DESCRIPTION, /^Per Olsen har firmahytta denne uka\./);
    assert.notEqual(his.UID, hers.UID);
    assert.equal(his.DTSTAMP, '20261021T090000Z');
    assert.deepEqual(await offered(per), [AUTUMN]);
    assert.deepEqual(await offered(kari), []);
  });

  test('a week that comes back to someone from the waiting list is another event than the first time', async () => {
    await kari.post(`/uker/${AUTUMN}/book`);
    const first = await event(kari);
    await ola.post(`/uker/${AUTUMN}/vent`);
    now = GIVEN_UP;
    await kari.post(`/uker/${AUTUMN}/avbestill`);
    await kari.post(`/uker/${AUTUMN}/vent`);
    now = new Date('2026-10-21T09:00:00Z');
    await ola.post(`/uker/${AUTUMN}/avbestill`);

    const again = await event(kari);
    assert.equal(book().bookings[AUTUMN].name, 'Kari Hansen');
    assert.notEqual(again.UID, first.UID);
  });

  test('a week in progress that is handed over is still the whole week in the calendar', async () => {
    // Someone first in line can get a week that has begun. The event is the week, not what is left of it.
    await ola.post('/uker/2026-W42/book');
    await kari.post('/uker/2026-W42/vent');
    now = new Date('2026-10-15T08:00:00Z');
    await ola.post('/uker/2026-W42/avbestill');

    const hers = lines(await (await kari.get('/uker/2026-W42/kalender.ics')).text());
    assert.deepEqual([hers.DTSTART, hers.DTEND], ['20261009T140000Z', '20261016T100000Z']);
    assert.equal(hers.DTSTAMP, '20261015T080000Z');
    assert.deepEqual(await offered(kari), ['2026-W42']);
  });
});

// Ragnhild's rule: Easter is one trip, from the Friday before Palm Sunday to the Friday after Easter
// Monday, and one winner has all of it, since nobody goes to the mountains for half an Easter.
// In 2027 that is week 12 and week 13: Friday 19 March to Friday 2 April.
describe('Easter is one trip', () => {
  const SECOND = '2027-W13';
  const TRIP = 'Uke 12 og 13 fre. 19. mars – fre. 2. april Trekning · Påske';
  const NAMES = ['Ola Nordmann', 'Kari Hansen', 'Per Olsen'];
  const enterAll = async () => {
    for (const name of NAMES) assert.equal((await person(name).post(`/uker/${EASTER}/meld-pa`)).status, 303);
  };
  /** Draws Easter and answers with whoever won, and the first of those who did not. */
  const drawEaster = async (week = EASTER) => {
    const response = await visitor.post(`/trekning/${week}/trekk`, { klar: 'ja' }, { Accept: 'application/json' });
    const drawn = await response.json();
    const name = drawn.entries[drawn.winner];
    return { name, browser: person(name), another: person(drawn.entries.find((each) => each !== name) ?? 'Nina Berg') };
  };
  const lines = (text) =>
    Object.fromEntries(text.replace(/\r\n /g, '').split('\r\n').map((line) => line.split(/:(.*)/s).slice(0, 2)));
  const hasCard = async (who, week) => (await (await who.get('/')).text()).includes(`id="${week}"`);

  test('the calendar shows it as one card with its two Fridays, and no card for its second week', async () => {
    assert.equal(await card(kari, EASTER), `${TRIP} Ingen påmeldt ennå Meld meg på Se trekningen`);
    assert.equal(await hasCard(kari, SECOND), false);
    assert.match(await card(kari, '2027-W11'), /^Uke 11 fre\. 12\. – fre\. 19\. mars Ledig/);
    assert.match(await card(kari, '2027-W14'), /^Uke 14 fre\. 2\. – fre\. 9\. april Ledig/);
  });

  test('the draw page shows the trip, by whichever of its weeks it is asked for', async () => {
    await enterAll();
    for (const week of [EASTER, SECOND]) {
      const response = await visitor.get(`/trekning/${week}`);
      const page = await response.text();
      assert.equal(response.status, 200, week);
      assert.match(page, /<h1>Påske<\/h1>/);
      assert.match(page, /<p class="draw-when">Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027<\/p>/);
      assert.match(page, /3 lodd i hatten/);
      assert.ok(page.includes(`action="/trekning/${EASTER}/trekk"`), 'and its button draws the trip');
    }
  });

  test('the manager’s page lists it as one trip, and does not offer its second week for a draw of its own', async () => {
    const page = await (await visitor.get('/kontorsjef')).text();

    assert.match(page, /<strong>Påske<\/strong>\s*<span>Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027<\/span>/);
    assert.ok(!page.includes(`<option value="${EASTER}">`));
    assert.ok(!page.includes(`<option value="${SECOND}">`));
    assert.match(page, /<option value="2027-W14">Uke 14 · fre\. 2\. – fre\. 9\. april 2027<\/option>/);

    const own = await visitor.post('/kontorsjef/trekningsuker', { uke: SECOND, navn: 'Påskehelga' });
    assert.equal(own.status, 409);
    assert.match(await own.text(), /role="alert">Det trekkes allerede lodd om uke 12 og 13\./);
  });

  test('people enter the trip, and its second week cannot be booked or waited for', async () => {
    assert.equal((await ola.post(`/uker/${SECOND}/meld-pa`)).status, 303, 'by its second week too');
    assert.equal(await card(ola, EASTER), `${TRIP} 1 påmeldt Du er med i trekningen Meld meg av Se trekningen`);

    const booked = await kari.post(`/uker/${SECOND}/book`);
    assert.equal(booked.status, 409);
    assert.match(await booked.text(), /role="alert">Det trekkes lodd om uke 12 og 13\. Meld deg på trekningen i stedet\./);
    assert.equal((await kari.post(`/uker/${SECOND}/vent`)).status, 409);
    assert.deepEqual(book().bookings, {});
  });

  test('drawing it gives one person both weeks', async () => {
    await enterAll();
    const winner = await drawEaster();

    assert.deepEqual(book().bookings, { [EASTER]: { name: winner.name, at: NOW.toISOString() } }, 'one booking, on the first week');
    assert.equal(await card(winner.browser, EASTER), `${TRIP} Du vant trekningen! Si fra deg turen Legg i kalenderen din Se trekningen`);
    assert.equal(await card(winner.another, EASTER), `${TRIP} ${winner.name} vant trekningen Se trekningen`);

    for (const week of [EASTER, SECOND]) {
      const taken = await winner.another.post(`/uker/${week}/book`);
      assert.equal(taken.status, 409, week);
      assert.ok((await taken.text()).includes(`Det er trukket lodd om uke 12 og 13, og den gikk til ${winner.name}.`), week);
    }
    const page = await (await visitor.get(`/trekning/${SECOND}`)).text();
    assert.ok(page.includes(`<p class="winner-name" data-winner-name>${winner.name}</p>`));
    assert.match(page, /Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027/);
  });

  test('the winner’s calendar file is one event for the whole trip, by either week’s address', async () => {
    await enterAll();
    const winner = await drawEaster(SECOND);

    for (const week of [EASTER, SECOND]) {
      const response = await winner.browser.get(`/uker/${week}/kalender.ics`);
      const event = lines(await response.text());
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="hytta-2027-uke-12.ics"', week);
      assert.equal(event.DTSTART, '20270319T150000Z', 'after work on Friday 19 March');
      assert.equal(event.DTEND, '20270402T100000Z', 'out at twelve on Friday 2 April, with no changeover on Good Friday');
      assert.equal(event.SUMMARY, 'Firmahytta\\, uke 12 og 13');
      assert.ok(event.DESCRIPTION.startsWith(`${winner.name} har firmahytta begge ukene.`));
    }
  });

  test('the winner gives the trip up whole, and it is drawn again among the others', async () => {
    await enterAll();
    const first = await drawEaster();
    assert.equal((await first.browser.post(`/uker/${SECOND}/avbestill`)).status, 303, 'by its second week');

    assert.deepEqual(book().bookings, {});
    assert.equal(book().draws[EASTER].entries.length, 2);
    assert.equal(await card(first.browser, EASTER), `${TRIP} 2 påmeldte Meld meg på Se trekningen`);
    assert.equal(await hasCard(first.browser, SECOND), false, 'no half of it is left free');

    const second = await drawEaster();
    assert.notEqual(second.name, first.name);
  });

  test('whoever wins Easter cannot win the winter break the same year', async () => {
    await enterAll();
    for (const name of NAMES) await person(name).post('/uker/2027-W08/meld-pa');
    const winner = await drawEaster();

    assert.match(await card(winner.browser, '2027-W08'), /2 påmeldte Du vant uke 12 og 13, og kan ikke vinne en uke til i 2027 Se trekningen$/);
    const again = await winner.browser.post('/uker/2027-W08/meld-pa');
    assert.equal(again.status, 409);
    assert.match(await again.text(), /role="alert">Du vant uke 12 og 13, og kan ikke vinne en uke til i 2027\./);
  });

  test('on Good Friday the winner stays: the trip is this week through both its weeks', async () => {
    await enterAll();
    const winner = await drawEaster();

    // Good Friday 2027 at twelve in Norway, when a week ends: 26 March, 11:00 UTC.
    now = new Date('2027-03-26T11:00:00Z');
    assert.equal(
      await card(winner.browser, EASTER),
      'Uke 12 og 13 fre. 19. mars – fre. 2. april Denne uka Trekning · Påske Du vant trekningen! Si fra deg turen Legg i kalenderen din Se trekningen',
    );
    const page = await (await visitor.get('/')).text();
    assert.ok(page.indexOf(`id="${EASTER}"`) < page.indexOf('id="2027-W14"'), 'and it is the first card');
    assert.equal(page.indexOf('<li class="week '), page.indexOf(`<li class="week week--drawn" id="${EASTER}"`));

    // The Friday after Easter Monday at twelve: 2 April, 10:00 UTC, in summer time.
    now = new Date('2027-04-02T10:00:00Z');
    assert.equal(await hasCard(visitor, EASTER), false);
    assert.match(await card(visitor, '2027-W14'), /^Uke 14 fre\. 2\. – fre\. 9\. april Denne uka Ledig$/);
  });

  describe('in a book written before Easter was one trip', () => {
    // The book as the copy that is running had it: no waiting lists, and Easter as one week with people entered.
    const ENTERED = ['Kari Nordmann', 'Per Hansen', 'Anne Olsen', 'Lars Berg', 'Mona Lie'];
    const OLDER = {
      bookings: {
        '2026-W43': { name: 'Ingrid Dahl', at: '2026-10-11T16:12:06.615Z' },
        '2026-W45': { name: 'Erik Moen', at: '2026-10-11T16:12:06.683Z' },
      },
      draws: {
        '2027-W08': { label: 'Vinterferie', entries: [{ name: 'Ola Nordmann', at: '2026-10-11T16:12:06.700Z' }] },
        '2027-W12': { label: 'Påske', entries: ENTERED.map((name, index) => ({ name, at: `2026-10-11T16:12:07.${index}00Z` })) },
      },
    };
    const openOlder = (older = OLDER) => {
      const written = `${JSON.stringify(older, null, 2)}\n`;
      writeFileSync(file, written);
      server.app = createApp({ store: openStore(file, () => assert.fail('the book is there')), now: () => now });
      return written;
    };

    test('it still reads, and reading it changes nothing in the file', async () => {
      const written = openOlder();
      for (const path of ['/', '/kontorsjef', `/trekning/${EASTER}`, `/trekning/${SECOND}`]) {
        assert.equal((await visitor.get(path)).status, 200, path);
      }
      assert.equal(readFileSync(file, 'utf8'), written);
    });

    test('those who had entered are in the draw for the whole trip', async () => {
      openOlder();
      const kariNordmann = person('Kari Nordmann');

      assert.equal(await card(kariNordmann, EASTER), `${TRIP} 5 påmeldte Du er med i trekningen Meld meg av Se trekningen`);
      assert.equal(await hasCard(kariNordmann, SECOND), false);
      const page = await (await visitor.get(`/trekning/${EASTER}`)).text();
      assert.deepEqual([...page.matchAll(/data-ticket>([^<]*)</g)].map((found) => found[1]), ENTERED);
      assert.match(page, /Uke 12 og 13 · fre\. 19\. mars – fre\. 2\. april 2027/);
    });

    test('the draw gives one of them both weeks', async () => {
      openOlder();
      const winner = await drawEaster();

      assert.ok(ENTERED.includes(winner.name));
      assert.deepEqual(Object.keys(book().bookings).sort(), ['2026-W43', '2026-W45', EASTER]);
      assert.equal((await person('Nina Berg').post(`/uker/${SECOND}/book`)).status, 409);
      assert.equal(lines(await (await winner.browser.get(`/uker/${SECOND}/kalender.ics`)).text()).DTEND, '20270402T100000Z');
    });

    test('someone who had booked the second week keeps it, and Easter is then the one week it was', async () => {
      openOlder({ ...OLDER, bookings: { ...OLDER.bookings, [SECOND]: { name: 'Nina Berg', at: '2026-10-11T16:13:00.000Z' } } });

      assert.equal(await card(visitor, EASTER), 'Uke 12 fre. 19. – fre. 26. mars Trekning · Påske 5 påmeldte Se trekningen');
      assert.equal(await card(visitor, SECOND), 'Uke 13 fre. 26. mars – fre. 2. april Booket av Nina Berg');

      assert.equal((await person('Nina Berg').post(`/uker/${SECOND}/avbestill`)).status, 303);
      assert.equal(await card(visitor, EASTER), `${TRIP} 5 påmeldte Se trekningen`, 'given up, it is part of the trip');
      assert.equal(await hasCard(visitor, SECOND), false);
    });
  });
});

// Hytteboka looks and reads like Miles. The rules are Miles' brand kit; these hold the pages to the
// parts of them a test can see.
describe('Miles’ look and voice', () => {
  const BRAND = fileURLToPath(new URL('../public/brand/', import.meta.url));
  const USED = [
    'miles.css', 'miles-logo-red.png', 'miles-logo-cream.png', 'miles-m-cream-on-red.png',
    'fjell.png', 'feiring.png', 'sign-oisann.png',
  ];
  const pages = async () => ({
    calendar: await (await kari.get('/')).text(),
    manager: await (await kari.get('/kontorsjef')).text(),
    draw: await (await visitor.get(`/trekning/${EASTER}`)).text(),
    missing: await (await visitor.get('/finnes-ikke')).text(),
  });

  test('every page carries Miles’ logo, as a file from the brand kit and never as typed letters', async () => {
    const { calendar, manager, draw, missing } = await pages();
    const red = /<img class="logo" src="\/brand\/miles-logo-red\.png" alt="Miles" width="650" height="220">/;
    for (const page of [calendar, manager, missing]) assert.match(page, red, 'the red logo on the light pages');
    assert.match(draw, /<img class="logo" src="\/brand\/miles-logo-cream\.png" alt="Miles" width="1207" height="379">/,
      'the cream logo on the burgundy stage');
    for (const page of [calendar, manager, draw, missing]) {
      assert.match(page, /<link rel="icon" type="image\/png" href="\/brand\/miles-m-cream-on-red\.png">/);
      assert.doesNotMatch(page, /Havbris/);
    }
  });

  test('the typefaces come from where Miles may show them from, and the tokens from the brand kit', async () => {
    for (const page of Object.values(await pages())) {
      assert.match(page, /<link rel="stylesheet" href="https:\/\/use\.typekit\.net\/npt7ifv\.css">/, 'Gelica, through Adobe’s kit');
      assert.match(page, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=DM\+Sans:wght@400;500;600&amp;display=swap">/);
      assert.ok(page.indexOf('/brand/miles.css') < page.indexOf('/stil.css'), 'the tokens load before the styles that use them');
    }
  });

  test('the drawings on the pages are Miles’ own', async () => {
    const { calendar, draw, missing } = await pages();
    assert.match(calendar, /<img class="hero-art" src="\/brand\/fjell\.png" alt=""/);
    assert.match(draw, /<span class="icon icon--feiring" aria-hidden="true"><\/span>/);
    assert.match(missing, /<img class="oops-art" src="\/brand\/sign-oisann\.png" alt=""/);
    for (const page of [calendar, draw, missing]) assert.doesNotMatch(page, /<svg/, 'no drawing of our own');
  });

  test('the brand files are served, and are the only ones kept: no font files', async () => {
    for (const name of USED) {
      const response = await visitor.get(`/brand/${name}`);
      assert.equal(response.status, 200, name);
      assert.match(response.headers.get('content-type'), name.endsWith('.css') ? /text\/css/ : /image\/png/, name);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(BRAND + name), name);
    }
    assert.deepEqual(readdirSync(BRAND).sort(), [...USED].sort());
    assert.equal((await visitor.get('/brand/miles-logo-white.png')).status, 404);
    assert.equal((await visitor.get('/hytte.svg')).status, 404, 'our own cabin drawing is gone');
  });

  test('every colour in the stylesheet is a name from the brand’s tokens', () => {
    const styles = readFileSync(fileURLToPath(new URL('../public/stil.css', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual(styles.match(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|color-mix)\(/gi) ?? [], []);

    const tokens = readFileSync(BRAND + 'miles.css', 'utf8');
    const named = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)/g)].map((found) => found[1]));
    const own = new Set([...styles.matchAll(/(--[a-z0-9-]+):/g)].map((found) => found[1]));
    for (const name of named) {
      assert.ok(own.has(name) || tokens.includes(`${name}:`), `${name} is not in the brand’s tokens`);
    }
  });

  test('the calendar speaks as “vi” to “du”', async () => {
    const { calendar, manager } = await pages();
    assert.match(calendar, /<h1>Når vil du på <em>hytta\?<\/em><\/h1>/);
    assert.match(calendar, /Ukene alle vil ha, trekker vi lodd om: meld deg på, så trekker vi vinneren mens hele kontoret ser på!/);
    assert.match(calendar, /Hytteuka går fra fredag til fredag\. De som reiser, er ute til klokka 12, så vaskehjelpen rekker over før de neste kommer etter jobb\./);
    assert.match(manager, /<h2>Ukene vi trekker lodd om<\/h2>/);
    assert.match(manager, /Hva kaller vi uka\?/);
  });

  test('the winner is cheered', async () => {
    await kari.post(`/uker/${EASTER}/meld-pa`);
    await visitor.post(`/trekning/${EASTER}/trekk`, { klar: 'ja' });

    const draw = await (await visitor.get(`/trekning/${EASTER}`)).text();
    assert.match(draw, /<p class="winner-lead">Hytta går til<\/p>\s*<p class="winner-name" data-winner-name>Kari Hansen<\/p>\s*<p class="winner-cheer">Gratulerer, og god tur!<\/p>/);
    assert.match(await card(kari, EASTER), /Du vant trekningen! /);
  });
});

describe('what the server is careful about', () => {
  test('a name is shown as it was typed, never read as markup', async () => {
    const rascal = person('<img src=x onerror=alert(1)>');
    await rascal.post(`/uker/${AUTUMN}/book`);
    await rascal.post(`/uker/${EASTER}/meld-pa`);

    for (const path of ['/', '/kontorsjef', `/trekning/${EASTER}`]) {
      const page = await (await kari.get(path)).text();
      assert.doesNotMatch(page, /<img src=x/, path);
      assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/, path);
    }
  });

  test('pages may load their own files, and from elsewhere only the two typefaces', async () => {
    const response = await visitor.get('/');
    assert.equal(response.headers.get('content-security-policy'), [
      "default-src 'self'",
      "style-src 'self' https://use.typekit.net https://p.typekit.net https://fonts.googleapis.com",
      'font-src https://use.typekit.net https://fonts.gstatic.com',
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  test('a form that another site made the browser send is turned away', async () => {
    const response = await ola.post(`/uker/${AUTUMN}/book`, {}, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(response.status, 403);
    assert.deepEqual(book().bookings, {});
    assert.equal((await ola.post(`/uker/${AUTUMN}/book`, {}, { 'Sec-Fetch-Site': 'same-origin' })).status, 303);
  });

  test('a form far bigger than any form here is turned away', async () => {
    const response = await ola.post('/navn', { navn: 'x'.repeat(20_000) });
    assert.equal(response.status, 413);
  });

  test('serves its style and scripts, and says so when a page is not there', async () => {
    for (const [path, type] of [
      ['/stil.css', /text\/css/],
      ['/trekning.js', /text\/javascript/],
      ['/hopp.js', /text\/javascript/],
    ]) {
      const response = await visitor.get(path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), type);
      assert.ok((await response.text()).length > 100);
    }

    const missing = await visitor.get('/server.js');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Den siden finnes ikke/);
    assert.equal((await visitor.get('/../package.json')).status, 404);
  });
});

// The server as people meet it: every request here goes over HTTP to a server on a port of its own,
// with a book in a folder of its own. It is Wednesday 14 October 2026, at twelve in Norway, in the week
// that runs from Saturday 10 to Saturday 17 October.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
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
    assert.equal(page.match(/<li class="week /g).length, 52);
    assert.match(page, /<h2>Oktober 2026<\/h2>/);
    assert.match(await card(visitor, '2026-W42'), /^Uke 42 lør\. 10\. – lør\. 17\. oktober Denne uka Ledig$/);
    assert.match(await card(visitor, EASTER), /Uke 12 lør\. 20\. – lør\. 27\. mars Trekning · Påske Ingen påmeldt ennå Se trekningen/);
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
  // Saturday 17 October 2026, when the week of 10 to 17 October ends. Summer time: twelve in Norway is 10:00 UTC.
  const BEFORE_TWELVE = new Date('2026-10-17T09:59:00Z');
  const TWELVE = new Date('2026-10-17T10:00:00Z');

  test('the calendar says that the week runs from Saturday to Saturday, and when those who leave are out', async () => {
    const page = await (await visitor.get('/')).text();
    assert.match(page, /Hytteuka går fra lørdag til lørdag\. De som reiser, er ute til klokka 12\./);
  });

  test('a week ends on the Saturday the next one starts', async () => {
    assert.match(await card(visitor, '2026-W42'), /^Uke 42 lør\. 10\. – lør\. 17\. oktober /);
    assert.match(await card(visitor, '2026-W43'), /^Uke 43 lør\. 17\. – lør\. 24\. oktober /);
    assert.match(await card(visitor, '2026-W44'), /^Uke 44 lør\. 24\. – lør\. 31\. oktober /);
  });

  test('until twelve on Saturday the week that ends is still this week, and can be booked', async () => {
    now = BEFORE_TWELVE;
    assert.match(await card(visitor, '2026-W42'), /Denne uka Ledig$/);
    assert.equal((await ola.post('/uker/2026-W42/book')).status, 303);
  });

  test('from twelve on Saturday the next week is this week, and the one that ended is over', async () => {
    now = TWELVE;
    const page = await (await visitor.get('/')).text();
    assert.doesNotMatch(page, /id="2026-W42"/);
    assert.equal(page.match(/<li class="week /g).length, 52);
    assert.match(await card(visitor, '2026-W43'), /^Uke 43 lør\. 17\. – lør\. 24\. oktober Denne uka Ledig$/);

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

// Ragnhild wrote that the page says the cabin is taken when one group leaves on a Saturday and
// the next arrives the same Saturday. These go through that Saturday: 17 October 2026, when
// Ola's week (10 to 17 October) ends and Kari's (17 to 24 October) starts.
describe('the Saturday one group leaves and the next arrives', () => {
  const LEAVING = '2026-W42';
  const ARRIVING = '2026-W43';
  const MORNING = new Date('2026-10-17T08:30:00Z'); // 10:30 in Norway, before those who leave are out
  const AFTERNOON = new Date('2026-10-17T13:00:00Z'); // 15:00 in Norway

  test('the week that starts that Saturday is free and can be booked, though the week that ends then is taken', async () => {
    await ola.post(`/uker/${LEAVING}/book`);

    assert.equal(await card(kari, LEAVING), 'Uke 42 lør. 10. – lør. 17. oktober Denne uka Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Ledig Book uka');

    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal(book().bookings[LEAVING].name, 'Ola Nordmann');
    assert.equal(book().bookings[ARRIVING].name, 'Kari Hansen');
  });

  test('it makes no difference which of the two weeks is booked first', async () => {
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal((await ola.post(`/uker/${LEAVING}/book`)).status, 303);
    assert.deepEqual(Object.keys(book().bookings).sort(), [LEAVING, ARRIVING]);
  });

  test('on the Saturday morning the page shows both: those who leave have this week, those who arrive the next', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    await kari.post(`/uker/${ARRIVING}/book`);
    now = MORNING;

    assert.equal(await card(kari, LEAVING), 'Uke 42 lør. 10. – lør. 17. oktober Denne uka Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Du har hytta Si fra deg uka');
    assert.equal(await card(ola, LEAVING), 'Uke 42 lør. 10. – lør. 17. oktober Denne uka Du har hytta Si fra deg uka');
    assert.equal(await card(ola, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Booket av Kari Hansen Sett meg på venteliste');
  });

  test('on the Saturday morning itself, the week that starts that day can still be booked', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    now = MORNING;

    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Ledig Book uka');
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Du har hytta Si fra deg uka');
  });

  test('after twelve the week of those who left is gone, and this week belongs to those who arrived', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    await kari.post(`/uker/${ARRIVING}/book`);
    now = AFTERNOON;

    assert.doesNotMatch(await (await kari.get('/')).text(), new RegExp(`id="${LEAVING}"`));
    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Denne uka Du har hytta Si fra deg uka');
    assert.equal(await card(ola, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Denne uka Booket av Kari Hansen Sett meg på venteliste');
  });

  test('after twelve the week that started that day is free for whoever comes, if nobody had booked it', async () => {
    await ola.post(`/uker/${LEAVING}/book`);
    now = AFTERNOON;

    assert.equal(await card(kari, ARRIVING), 'Uke 43 lør. 17. – lør. 24. oktober Denne uka Ledig Book uka');
    assert.equal((await kari.post(`/uker/${ARRIVING}/book`)).status, 303);
  });

  test('the weeks on both sides of a week that was drawn can be booked', async () => {
    // The winter break, 20 to 27 February 2027, shares a Saturday with the week before and the week after.
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

    assert.equal(await card(ola, AUTUMN), 'Uke 45 lør. 31. oktober – lør. 7. november Du har hytta Si fra deg uka');
    assert.equal(await card(kari, AUTUMN), 'Uke 45 lør. 31. oktober – lør. 7. november Booket av Ola Nordmann Sett meg på venteliste');
    assert.equal(await card(visitor, AUTUMN), 'Uke 45 lør. 31. oktober – lør. 7. november Booket av Ola Nordmann');
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
    assert.match(await response.text(), /Det trekkes lodd om uke 12\. Meld deg på trekningen i stedet\./);
  });
});

// Ragnhild asked for a waiting list when the week is taken. Ola has the autumn week, 31 October to 7 November.
describe('the waiting list', () => {
  const WEEK = 'Uke 45 lør. 31. oktober – lør. 7. november';
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
      'Du har fått uke 45, lør. 31. oktober – lør. 7. november 2026.',
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
    assert.match(await draw.text(), /role="alert">Det trekkes lodd om uke 12\. Meld deg på trekningen i stedet\./);

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

    assert.equal(await card(kari, EASTER), 'Uke 12 lør. 20. – lør. 27. mars Trekning · Påske Nina Berg vant trekningen Se trekningen');
    const response = await kari.post(`/uker/${EASTER}/vent`);
    assert.equal(response.status, 409);
    assert.match(
      await response.text(),
      /role="alert">Det er trukket lodd om uke 12\. Sier Nina Berg den fra seg, trekkes det på nytt blant de andre som var påmeldt\./,
    );
  });

  test('the week we are in has a waiting list until it is over', async () => {
    await ola.post('/uker/2026-W42/book');
    assert.equal((await kari.post('/uker/2026-W42/vent')).status, 303);

    now = new Date('2026-10-17T10:00:00Z'); // Saturday at twelve, when the week ends
    const late = await per.post('/uker/2026-W42/vent');
    assert.equal(late.status, 409);
    assert.match(await late.text(), /role="alert">Uke 42 er over\./);
    assert.equal((await kari.post('/uker/2026-W42/ikke-vent')).status, 409);
  });

  test('a name on the waiting list is shown as it was typed, never read as markup', async () => {
    const rascal = person('<img src=x onerror=alert(1)>');
    await rascal.post(`/uker/${AUTUMN}/vent`);
    assert.doesNotMatch(await (await kari.get('/')).text(), /<img/);
    assert.match(await (await kari.get('/')).text(), /<li>&lt;img src=x onerror=alert\(1\)&gt;<\/li>/);

    // Then the rascal has the week, and gives it up to Kari, who is told from whom.
    await ola.post(`/uker/${AUTUMN}/avbestill`);
    await kari.post(`/uker/${AUTUMN}/vent`);
    await rascal.post(`/uker/${AUTUMN}/avbestill`);
    const page = await (await kari.get('/')).text();
    assert.doesNotMatch(page, /<img/);
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
    assert.match(page, /Uke 12 · lør\. 20\. – lør\. 27\. mars 2027/);
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
    assert.match(await card(person(winner), EASTER), /Du vant trekningen Si fra deg uka Se trekningen$/);

    const page = await (await visitor.get(`/trekning/${EASTER}`)).text();
    assert.match(page, new RegExp(`<p class="winner-name" data-winner-name>${winner}</p>`));
    assert.match(page, /Trukket 14\. oktober 2026 kl\. 12[:.]00 blant 3 påmeldte\./);
    assert.match(page, new RegExp(`<li class="ticket is-winner" data-ticket>${winner}</li>`));
    assert.doesNotMatch(page, /Trekk vinneren/);

    const again = await draw();
    assert.equal(again.status, 409);
    assert.match((await again.json()).message, new RegExp(`Trekningen om uke 12 er gjort\\. Uka gikk til ${winner}\\.`));
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
      'Uke 12 lør. 20. – lør. 27. mars Trekning · Påske 2 påmeldte Du vant uke 8, og kan ikke vinne en uke til i 2027 Se trekningen',
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

    assert.match(page, /<strong>Påske<\/strong>\s*<span>Uke 12 · lør\. 20\. – lør\. 27\. mars 2027<\/span>/);
    assert.match(page, /2 påmeldte: <span class="person">Ola Nordmann, Kari Hansen<\/span>/);
    assert.match(page, new RegExp(`href="/trekning/${EASTER}">Åpne trekningen`));
    assert.match(page, /<option value="2026-W45">Uke 45 · lør\. 31\. oktober – lør\. 7\. november 2026<\/option>/);
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
    assert.match(await entered.text(), /1 har meldt seg på trekningen om uke 12/);

    assert.equal((await visitor.post('/kontorsjef/trekningsuker', {})).status, 404);
  });
});

describe('what the server is careful about', () => {
  test('a name is shown as it was typed, never read as markup', async () => {
    const rascal = person('<img src=x onerror=alert(1)>');
    await rascal.post(`/uker/${AUTUMN}/book`);
    await rascal.post(`/uker/${EASTER}/meld-pa`);

    for (const path of ['/', '/kontorsjef', `/trekning/${EASTER}`]) {
      const page = await (await kari.get(path)).text();
      assert.doesNotMatch(page, /<img/, path);
      assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/, path);
    }
  });

  test('pages may load their own files and nothing else', async () => {
    const response = await visitor.get('/');
    assert.match(response.headers.get('content-security-policy'), /^default-src 'self';/);
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

  test('serves its style, scripts and icon, and says so when a page is not there', async () => {
    for (const [path, type] of [
      ['/stil.css', /text\/css/],
      ['/trekning.js', /text\/javascript/],
      ['/hopp.js', /text\/javascript/],
      ['/hytte.svg', /image\/svg\+xml/],
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

// The overview sent out on Fridays: who has the cabin the next four weeks, as plain text in
// Norwegian to paste into an e-mail. It is written the way Miles writes to colleagues: a greeting,
// "du", and a door left open at the end.

import { describe, Uke } from './cabin.js';
import { addWeeks, CHANGEOVER_HOUR, currentWeek, formatRange } from './weeks.js';

/**
 * The next four weeks are the four after the one we are in. On a Friday that is from
 * tomorrow's changeover on; the week that ends tomorrow is not among them.
 */
export function overviewText(state, now = new Date()) {
  const thisWeek = currentWeek(now);
  const weeks = [1, 2, 3, 4].map((ahead) => describe(state, addWeeks(thisWeek, ahead)));

  // The invitation to book is only there when there is a week to book.
  const anyFree = weeks.some(({ booking, draw }) => !booking && !draw);
  const closing = `${anyFree ? 'Ser du en ledig uke? Da er det bare å booke den i Hytteboka. ' : ''}God tur til alle som skal av gårde!`;

  return [
    'Hei!',
    '',
    'Her er hvem som har hytta de neste fire ukene:',
    '',
    ...weeks.map(line),
    '',
    `Hytteuka går fra lørdag til lørdag. De som reiser, er ute til klokka ${CHANGEOVER_HOUR}.`,
    '',
    closing,
  ].join('\n');
}

function line({ week, booking, draw }) {
  const name = draw?.label ? `${Uke(week)} (${draw.label})` : Uke(week);
  return `${name}, ${formatRange(week, { year: false })}: ${holder({ booking, draw })}`;
}

function holder({ booking, draw }) {
  if (!draw) return booking ? booking.name : 'ledig';
  if (booking) return `${booking.name} (vant trekningen)`;

  const count = draw.entries.length;
  const entered = count === 0 ? 'ingen påmeldt' : `${count} påmeldt${count === 1 ? '' : 'e'}`;
  return `trekning, ikke trukket ennå (${entered})`;
}

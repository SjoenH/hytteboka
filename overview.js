// Prints who has the cabin the next four weeks, from the book as it is now: `node overview.js`
// It only reads the book, so it can be run while the server is up.

import { readFileSync } from 'node:fs';
import { overviewText } from './src/overview.js';
import { BOOK_FILE } from './src/store.js';

// Another book can be named after the command, which is how the tests run it.
const file = process.argv[2] ?? BOOK_FILE;

let state;
try {
  state = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.error(`Fant ikke boka i ${file}. Den lages første gang hytteboka startes med npm start.`);
  process.exit(1);
}

console.log(overviewText(state));

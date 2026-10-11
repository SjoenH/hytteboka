// Starts the cabin book: `npm start`, then http://localhost:44210

import { createServer } from 'node:http';
import { createApp } from './src/app.js';
import { firstState } from './src/cabin.js';
import { BOOK_FILE, openStore } from './src/store.js';

const PORT = 44210;

const store = openStore(BOOK_FILE, () => firstState());
const server = createServer(createApp({ store }));

// Answers this machine only. Putting the book where the whole office reaches it is a decision still to make.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Hytteboka er oppe: http://localhost:${PORT}`);
  console.log(`Boka ligger i ${BOOK_FILE}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}

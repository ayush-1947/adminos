import { fork } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const env = existsSync(envPath) ? dotenv.parse(readFileSync(envPath)) : {};
const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
  throw new Error(
    'Use the production startup command; local database startup is development-only.',
  );
}
if (databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL. Check your .env.');
  }
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54329') {
    console.log('Using configured external PostgreSQL; no local database will be started.');
    process.exit(0);
  }
  // local-db.mjs deliberately uses the .env file; avoid starting against different credentials.
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== env.DATABASE_URL) {
    throw new Error(
      'For embedded PostgreSQL, keep DATABASE_URL in .env rather than overriding it in the shell.',
    );
  }
}
const listening = await new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port: 54329 });
  const finish = (value) => {
    socket.destroy();
    resolve(value);
  };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(1500, () => finish(false));
});
if (listening) {
  console.log('Local PostgreSQL is already listening on 127.0.0.1:54329.');
  process.exit(0);
}
mkdirSync(resolve(root, '.local'), { recursive: true });
const log = openSync(resolve(root, '.local/postgres-startup.log'), 'a');
console.log('Starting local PostgreSQL before the API and web app…');
let child;
try {
  child = fork(resolve(root, 'scripts/local-db.mjs'), [], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log, 'ipc'],
  });
} finally {
  closeSync(log);
}
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    if (child.connected) child.disconnect();
    child.unref();
    reject(
      new Error(
        'Local PostgreSQL did not become ready in 60 seconds. Check .local/postgres-startup.log.',
      ),
    );
  }, 60000);
  child.once('error', () => {
    clearTimeout(timer);
    reject(
      new Error(
        'Could not start local PostgreSQL. Run npm run db:local to inspect the startup error.',
      ),
    );
  });
  child.once('exit', (code) => {
    clearTimeout(timer);
    reject(new Error(`Local PostgreSQL exited (${code}). Check .local/postgres-startup.log.`));
  });
  child.on('message', (message) => {
    if (message?.type !== 'ready') return;
    clearTimeout(timer);
    child.disconnect();
    child.unref();
    resolve();
  });
});
console.log('Local PostgreSQL is ready. It will keep running in the background.');

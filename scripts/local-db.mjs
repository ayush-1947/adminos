import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
mkdirSync('.local', { recursive: true });
if (!existsSync('.env')) {
  const password = randomBytes(24).toString('hex');
  const env = `NODE_ENV=development\nPORT=4000\nAPP_ORIGIN=http://localhost:3000\nAPI_INTERNAL_URL=http://localhost:4000\nDATABASE_URL=postgresql://postgres:${password}@localhost:54329/useless_os?schema=public\nDIRECT_URL=postgresql://postgres:${password}@localhost:54329/useless_os?schema=public\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nSEED_ADMIN_EMAIL=admin@useless.example\nSEED_ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\n`;
  writeFileSync('.env', env, { mode: 0o600 });
  console.log(
    'Created local .env with generated credentials. Read SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD there to sign in.',
  );
}
const env = dotenv.parse(readFileSync('.env'));
const url = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '54329')
  throw new Error('Local helper requires localhost:54329. Existing .env was left untouched.');
const pg = new EmbeddedPostgres({
  databaseDir: resolve('.local/postgres'),
  port: 54329,
  user: url.username,
  password: url.password,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync('.local/postgres/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', ['useless_os']);
await client.end();
if (!result.rowCount) await pg.createDatabase('useless_os');
console.log('Local PostgreSQL ready on 127.0.0.1:54329. Keep this process running.');
if (process.send) process.send({ type: 'ready' });
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);

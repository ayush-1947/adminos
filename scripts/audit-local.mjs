import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  cpSync,
  writeFileSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

// Always create a fresh synthetic cluster. Never read DATABASE_URL or seed credentials from .env.
const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const runId = Date.now().toString();
const directory = resolve('.local', `audit-${runId}`);
mkdirSync(directory, { recursive: true });
const password = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:54339/useless_os?connection_limit=3`;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  SESSION_SECRET: randomBytes(48).toString('hex'),
  APP_ORIGIN: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://localhost:4000',
  PORT: '4000',
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: '--max-old-space-size=192',
};
for (const role of ['ADMIN', 'MANAGER', 'SUPERVISOR', 'CUSTOMER', 'ACCOUNTANT']) {
  env[`SEED_${role}_EMAIL`] = `audit-${role.toLowerCase()}@example.invalid`;
  env[`SEED_${role}_PASSWORD`] = randomBytes(24).toString('base64url');
}
// Prevent optional external storage credentials from being inherited or loaded by dotenv.
env.SUPABASE_URL = '';
env.SUPABASE_SERVICE_ROLE_KEY = '';
const evidence = {
  date: new Date().toISOString(),
  environment: 'isolated synthetic local PostgreSQL 18 / Node ' + process.version,
  checks: {},
};
const children = [];
const run = (args, options = {}) =>
  new Promise((resolveRun, reject) => {
    if (args[0].startsWith('node_modules/')) args = [resolve(args[0]), ...args.slice(1)];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${args[0]} exited ${code}`)),
    );
  });
function start(args, name, extra = {}) {
  const log = openSync(resolve(directory, `${name}.log`), 'a');
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...env, ...extra },
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  children.push(child);
  child.once('error', (error) => console.error(`${name} failed: ${error.code}`));
  return child;
}
async function ready(url) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Service did not become ready: ${url}`);
}
function cluster(databaseDir) {
  return new EmbeddedPostgres({
    databaseDir,
    port: 54339,
    user: 'postgres',
    password,
    persistent: true,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-h', '127.0.0.1', '-c', 'shared_buffers=32MB', '-c', 'max_connections=30'],
    onLog: () => {},
    onError: () => {},
  });
}
async function manifest() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const result = {};
    for (const { tablename } of tables.rows) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const rows = await client.query(
        `SELECT row_to_json(t)::text AS row FROM public.${quoted} t ORDER BY row_to_json(t)::text`,
      );
      result[tablename] = {
        rows: rows.rowCount,
        sha256: createHash('sha256')
          .update(rows.rows.map((r) => r.row).join('\n'))
          .digest('hex'),
      };
    }
    return result;
  } finally {
    await client.end();
  }
}
let pg = cluster(resolve(directory, 'source'));
let running = false;
async function stopCluster() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const { pg_ctl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  await new Promise((done, reject) => {
    const child = spawn(pg_ctl, ['-D', pg.options.databaseDir, '-m', 'fast', '-w', 'stop'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? done() : reject(new Error('Clean PostgreSQL shutdown failed')),
    );
  });
  // The library's Windows stop() force-kills the tree; pg_ctl above performs a clean checkpoint.
  pg.process = undefined;
  running = false;
}
try {
  for (const port of [3000, 4000]) {
    const { createServer } = await import('node:net');
    await new Promise((r, j) => {
      const server = createServer();
      server.once('error', j);
      server.listen(port, '127.0.0.1', () => server.close(r));
    });
  }
  console.log('Initializing disposable local database.');
  await pg.initialise();
  await pg.start();
  running = true;
  await pg.createDatabase('useless_os');
  console.log('Applying repository SQL migrations to the empty database.');
  const migrationClient = new Client({ connectionString: databaseUrl });
  await migrationClient.connect();
  try {
    for (const entry of readdirSync('packages/database/prisma/migrations', { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await migrationClient.query(
        readFileSync(`packages/database/prisma/migrations/${entry.name}/migration.sql`, 'utf8'),
      );
    }
  } finally {
    await migrationClient.end();
  }
  evidence.checks.schema = {
    status: 'pass',
    method:
      'Applied repository migration SQL in order to empty isolated database; Prisma CLI deployment is not exercised by this harness.',
  };
  await run(['--import', 'tsx', 'packages/database/prisma/seed.ts']);
  try {
    await run(['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], {
      cwd: resolve('apps/api'),
    });
    evidence.checks.api = { status: 'pass' };
  } catch (error) {
    evidence.checks.api = { status: 'fail', reason: error.message };
  }
  const api = start(['apps/api/dist/server.js'], 'api');
  start(
    [
      'node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3000',
    ],
    'web',
    { NODE_ENV: 'production' },
  );
  await ready('http://localhost:4000/api/ready');
  await ready('http://localhost:3000/api/ready');
  try {
    await run(['node_modules/@playwright/test/cli.js', 'test']);
    evidence.checks.browser = { status: 'pass' };
  } catch (error) {
    evidence.checks.browser = { status: 'fail', reason: error.message };
  }
  api.kill();
  await new Promise((r) => (api.exitCode !== null || api.signalCode !== null ? r() : api.once('exit', r)));
  start(['apps/api/dist/server.js'], 'api-load');
  await ready('http://localhost:4000/api/ready');
  // Bounded localhost-only workload: 2 workers, 80 requests, no writes beyond login.
  const login = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error('Load-test login failed');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const samples = [];
  let next = 0;
  const from = new Date(Date.now() - 30 * 86400000).toISOString();
  const to = new Date().toISOString();
  const routes = [
    '/api/resources/sites?limit=20',
    `/api/dashboard?${new URLSearchParams({ from, to })}`,
    '/api/org-chart',
    '/api/reports/sites/csv',
  ];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < 80) {
        const index = next++;
        const route = routes[index % routes.length];
        const startTime = performance.now();
        const response = await fetch(`http://localhost:4000${route}`, {
          headers: { Cookie: cookie },
          signal: AbortSignal.timeout(15000),
        });
        await response.arrayBuffer();
        samples.push({
          route: route.split('?')[0],
          status: response.status,
          ms: Math.round((performance.now() - startTime) * 100) / 100,
        });
      }
    }),
  );
  const duration = performance.now() - started;
  evidence.checks.load = {
    status: samples.every((s) => s.status === 200) ? 'pass' : 'fail',
    requests: samples.length,
    concurrency: 2,
    seconds: +(duration / 1000).toFixed(2),
    requestsPerSecond: +((samples.length / duration) * 1000).toFixed(2),
    endpoints: Object.fromEntries(
      routes
        .map((route) => route.split('?')[0])
        .map((route) => {
          const group = samples.filter((s) => s.route === route).sort((a, b) => a.ms - b.ms);
          return [
            route,
            {
              requests: group.length,
              p50ms: group[Math.ceil(group.length * 0.5) - 1].ms,
              p95ms: group[Math.ceil(group.length * 0.95) - 1].ms,
              maxMs: group.at(-1).ms,
              non200: group.filter((s) => s.status !== 200).length,
            },
          ];
        }),
    ),
  };
  for (const child of children) {
    child.kill();
    await new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', r)));
  }
  const before = await manifest();
  await stopCluster();
  // Cold physical backup, then deliberately alter only the disposable source cluster.
  const backup = resolve(directory, 'backup');
  cpSync(resolve(directory, 'source'), backup, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await pg.start();
  running = true;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("UPDATE organizations SET name='Disposable recovery drill mutation'");
  await client.end();
  const changed = await manifest();
  if (JSON.stringify(before) === JSON.stringify(changed))
    throw new Error('Recovery drill mutation did not change the source');
  await stopCluster();
  const restored = resolve(directory, 'restored');
  cpSync(backup, restored, { recursive: true, errorOnExist: true, force: false });
  pg = cluster(restored);
  await pg.start();
  running = true;
  const after = await manifest();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Restored database manifest does not match backup');
  evidence.checks.recovery = {
    status: 'pass',
    method: 'cold physical backup, source mutation, restore into separate cluster directory',
    tables: Object.keys(after).length,
    rows: Object.values(after).reduce((sum, t) => sum + t.rows, 0),
    manifest: after,
    limitation:
      'Synthetic local PostgreSQL 18 only; does not verify provider backups, PITR, encryption, retention or PostgreSQL 17 compatibility.',
  };
} catch (error) {
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  if (running) await stopCluster();
  mkdirSync('docs/audit', { recursive: true });
  writeFileSync('docs/audit/local-validation.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        ...evidence,
        checks: {
          ...evidence.checks,
          recovery: evidence.checks.recovery
            ? { ...evidence.checks.recovery, manifest: '(saved to artifact)' }
            : undefined,
        },
      },
      null,
      2,
    ),
  );
  if (Object.values(evidence.checks).some((check) => check.status !== 'pass')) process.exitCode = 1;
}

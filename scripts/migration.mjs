import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const path = 'packages/database/prisma/migrations/202609150001_initial';
mkdirSync(path, { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'packages/database/prisma/schema.prisma',
    '--script',
  ],
  { encoding: 'utf8' },
);
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(1);
}
writeFileSync(`${path}/migration.sql`, result.stdout);
writeFileSync(
  'packages/database/prisma/migrations/migration_lock.toml',
  'provider = "postgresql"\n',
);
console.log('Initial PostgreSQL migration generated.');

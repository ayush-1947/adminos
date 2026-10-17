import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const out = 'docs/audit';
mkdirSync(out, { recursive: true });
const app = readFileSync('apps/api/src/app.ts', 'utf8');
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(readFileSync('apps/api/src/modules/resources/catalog.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
);
const catalog = context.exports.catalog;
const rules = (route, method) => {
  if (route === '/api/health' || route === '/api/ready')
    return ['Public', 'None', 'Operational probe', 'Low'];
  if (route === '/api/attendance/tap')
    return [
      'Device HMAC lookup',
      'Active device/card/assignment',
      'Strict tap schema; 5 minute window; serializable replay checks',
      'High',
    ];
  if (route === '/api/auth/login')
    return [
      'Public',
      'Valid active account',
      'Strict email/password; failed login limiter',
      'High',
    ];
  if (route.includes('/admin/'))
    return [
      'Session',
      route.includes('/devices') || route.includes('/cards')
        ? 'devices:manage + scoped target'
        : 'users:manage; organization scope for mutations',
      'Strict body/UUID for mutations; tenant queries',
      'High',
    ];
  if (route.includes('/profiles/'))
    return [
      'Session',
      'profileOwner tenant/scope + role + write permission for manager mutations; own customer exception',
      'UUID/type; strict profile/payment/asset schemas',
      'High',
    ];
  if (route.includes('/resources/'))
    return [
      'Session',
      ':key:read or :key:write + scopeFor',
      'Catalog schema; relationships; workflow rules; serializable writes',
      'High',
    ];
  if (route.includes('/reports/'))
    return [
      'Session',
      'reports:read + :key:read + scopeFor',
      'Format enum; bounded queries; 10000 row cap; formula escaping',
      'Medium',
    ];
  if (route.includes('/billing/') || route.includes('/saved-pdfs/'))
    return [
      'Session',
      'Source read + scope; source write for save',
      'UUID/source enum; strict PDF options; signature/size logo checks',
      'High',
    ];
  if (route.includes('/documents'))
    return [
      'Session',
      'documents:read/write + scoped parent/document',
      'UUID/metadata; 10 MB; file signatures; signed URLs',
      'High',
    ];
  if (route.includes('/attendance/register'))
    return [
      'Session',
      'attendance:read/write + management role + site/team scope',
      'Strict date/entries; max 200; optimistic versions; serializable write',
      'High',
    ];
  if (route === '/api/org-chart')
    return [
      'Session',
      'employees:read + scoped sites; ancestor names within tenant',
      'Principal-derived scope; minimized chart fields',
      'Medium',
    ];
  if (route === '/api/customer/team')
    return [
      'Session',
      'Customer role + scoped sites',
      'Principal-derived scope; active assignments',
      'Medium',
    ];
  if (route === '/api/dashboard')
    return [
      'Session',
      'dashboard:read + per-resource read and scope',
      'ISO date range <=366 days; optional unit UUID',
      'Medium',
    ];
  if (route.includes('/notifications/'))
    return [
      'Session',
      method === 'PATCH'
        ? 'Owner user + organization'
        : 'notifications:read + per-resource read/scope',
      'UUID for read marker; bounded rule queries',
      'Medium',
    ];
  return [
    'Session',
    'Own identity/session or permission-filtered catalog',
    'Principal-derived values',
    'Low',
  ];
};
const rows = [
  [
    'Method',
    'Route',
    'Source line',
    'Authentication',
    'Authorization',
    'Validation/control',
    'Review priority',
  ],
];
for (const match of app.matchAll(/app\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)) {
  const [, method, route] = match;
  const line = app.slice(0, match.index).split('\n').length;
  const routes =
    route.includes(':key') && route.includes('/resources/')
      ? Object.keys(catalog).map((key) => route.replace(':key', key))
      : [route];
  for (const expanded of routes)
    rows.push([method.toUpperCase(), expanded, line, ...rules(route, method.toUpperCase())]);
}
const csv = (values) =>
  values
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n') + '\n';
writeFileSync(`${out}/api-matrix.csv`, csv(rows));
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', 'dist', '.git', '.local'].includes(entry.name)) return [];
    if (entry.name.endsWith('.tsbuildinfo')) return [];
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = [
  ...['apps', 'packages', 'scripts', 'tests', '.github'].flatMap(walk),
  'Dockerfile',
  'compose.yml',
  'render.yaml',
  'package.json',
  'package-lock.json',
  '.env.example',
];
const inventory = [['Path', 'Lines', 'SHA256', 'Review coverage']];
for (const file of files) {
  if (
    !/^(apps|packages|scripts|tests|\.github)\//.test(file) &&
    !/^(Dockerfile|compose.yml|render.yaml|package.*json|\.env.example)$/.test(file)
  )
    continue;
  if (/\.env$/.test(file)) continue;
  const content = readFileSync(file);
  inventory.push([
    file,
    content.toString().split('\n').length,
    createHash('sha256').update(content).digest('hex'),
    file.startsWith('apps/api/src/')
      ? 'Security flow review; not exhaustive line-by-line certification'
      : file.startsWith('apps/web/')
        ? 'Targeted static review; not full browser verification'
        : 'Inventory and targeted configuration/schema review',
  ]);
}
writeFileSync(`${out}/source-inventory.csv`, csv(inventory));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
writeFileSync(
  `${out}/dependency-versions.json`,
  JSON.stringify(
    Object.fromEntries(
      Object.entries(lock.packages)
        .filter(([key]) =>
          /^node_modules\/(next|react|express|@prisma\/client|bcryptjs|zod|multer|vitest|typescript)$/.test(
            key,
          ),
        )
        .map(([key, value]) => [key.slice(13), value.version]),
    ),
    null,
    2,
  ) + '\n',
);
console.log(
  `Wrote ${rows.length - 1} API matrix rows and ${inventory.length - 1} source inventory entries. Risk labels are review priorities, not confirmed vulnerabilities.`,
);

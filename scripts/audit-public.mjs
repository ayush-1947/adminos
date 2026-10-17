import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const origin = 'https://operations-os-web.onrender.com';
const priorPath = 'docs/audit/public-validation.json';
const prior = existsSync(priorPath) ? JSON.parse(readFileSync(priorPath, 'utf8')) : null;
const evidence = {
  checkedAt: new Date().toISOString(),
  origin,
  method: 'Read-only public HTTPS requests; no credentials or writes',
  requests: [],
};
for (const path of ['/', '/login', '/api/health', '/api/ready', '/api/auth/me']) {
  const started = performance.now();
  try {
    const response = await fetch(origin + path, {
      signal: AbortSignal.timeout(90000),
      redirect: 'follow',
    });
    const content = await response.text();
    const headers = Object.fromEntries(
      [
        'content-type',
        'cache-control',
        'content-security-policy',
        'strict-transport-security',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'x-request-id',
      ].map((key) => [key, response.headers.get(key)]),
    );
    evidence.requests.push({
      path,
      status: response.status,
      finalUrl: response.url,
      milliseconds: Math.round(performance.now() - started),
      headers,
      ...(path.startsWith('/api/') && content.length < 500 ? { body: content } : {}),
    });
  } catch (error) {
    evidence.requests.push({
      path,
      error: error.cause?.code || error.name,
      milliseconds: Math.round(performance.now() - started),
    });
  }
}
evidence.passed = evidence.requests.every(
  (request) => request.status === (request.path === '/api/auth/me' ? 401 : 200),
);
if (prior)
  evidence.previousChecks = [
    ...(prior.previousChecks || []),
    {
      checkedAt: prior.checkedAt,
      statuses: prior.requests.map(({ path, status, error }) => ({ path, status, error })),
    },
  ].slice(-10);
writeFileSync(priorPath, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.passed) process.exitCode = 1;

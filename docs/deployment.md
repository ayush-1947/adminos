# Production deployment

## Prerequisites

1. Provision an isolated Supabase PostgreSQL project (or PostgreSQL 17), backups and point-in-time recovery. Test restoring a backup before go-live.
2. Create a private `operations-documents` storage bucket. Do not permit anonymous reads or public bucket URLs. Configure service credentials on the API only.
3. Set production environment variables in a secret manager: HTTPS `APP_ORIGIN`, database runtime/direct connection strings, a generated `SESSION_SECRET`, and private Storage credentials.
4. Use a server-only PostgreSQL role. ERP tables enable RLS without browser policies; the API role must have the required table access and bypass/ownership privileges. Never publish this role's credentials or expose these tables directly via Supabase clients.
5. Configure HTTPS termination and request/body limits at your ingress. Forward the original `Origin`. Do not trust arbitrary forwarded IP headers. This API intentionally leaves Express `trust proxy` disabled; use a trusted edge limiter for correct distributed/IP rate limiting.

## Deploy with Docker

```sh
docker compose build
docker compose up -d
```

The migration container runs `prisma migrate deploy` once before the API starts. API readiness blocks web startup until PostgreSQL is available. The API is internal to the Compose network; Next is bound to localhost port 3000 for a host reverse proxy. Terminate TLS on your ingress and route to this port. The production API refuses a non-HTTPS browser origin.

For a local Docker database, `docker compose --profile local up -d postgres` requires `POSTGRES_PASSWORD`. Use `postgres:5432` from other Compose services and `localhost:5432` from the host. Do not use the embedded development database as production storage.

Next's rewrite destination is determined at build time. Build web with the API service destination `http://api:4000` (the provided Docker build sets it). If deploying separately, set `API_INTERNAL_URL` during the Next build and at runtime to your internal API origin.

Create the initial production organization and administrator with `npm run provision` from the migration image or a secured admin shell (documented environment variables: `BOOTSTRAP_ORGANIZATION`, `BOOTSTRAP_SLUG`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`). This creates roles and business units without development fixtures. Never run the development seed on production data.

## Release verification

- Apply migrations to a staging database; run `npm run typecheck`, `npm test`, `npm run build`, and browser smoke tests.
- Verify all six role scopes with real assignment patterns, including cross-unit client/site attempts.
- Pilot on a small set of sites before expanding to 150+. Establish operational sign-off on attendance windows, quantity reconciliation, batch completion and invoice workflows.
- Load-test representative dashboard ranges, concurrent taps, and reports. The current analytics implementation reads scoped period data; add SQL rollups/materialized views and retention once real volumes are measured.
- Configure a shared edge rate limiter before running multiple API replicas; the in-process limiter is only an additional local guard.
- Implement a scheduled notification worker, malware scanning for uploads, and the organization's desired MFA/SSO/recovery policy before deploying to high-risk environments.
- Configure log aggregation (Pino JSON to stdout), alerts for readiness failures/5xx, storage monitoring, database connection budgets and backup retention.
- Smoke-test private storage uploads/downloads against the actual Supabase project; this cannot be verified without project credentials.
- Run migrations as a single release job; scale the API only after it succeeds. Roll back application images independently. Use reviewed forward-fix migrations, never `db push` or development resets in production.

## Security properties and limits

HTTPS-only secure session cookies, eight-hour token expiry, database-backed revocation, bcrypt cost 12, exact-origin write checks, server-side RBAC, tenant-scoped queries, composite tenant foreign keys, SQL checks, validation, audit logging and file size limits are implemented.

This does not assert regulatory compliance, penetration-test certification, or proven 150-site throughput. Hardware, Supabase Storage, Docker image execution and deployment need environment-specific verification. Offline PWA writes, IoT ingestion, AI predictions, payroll, tax accounting, refunds, automated external messaging and SSO/MFA are not enabled.

## Reference documentation

- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Prisma production migrations](https://docs.prisma.io/docs/cli/migrate/deploy)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

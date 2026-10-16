# Architecture and extension guide

## Runtime boundaries

```text
Next.js App Router (same-origin browser requests)
  /api/* reverse proxy
Express API
  request ID → logging → rate limit → origin validation
  database session → user/role permissions → tenant and assignment scope
  resource validation → relationship validation → domain workflow
  Prisma transaction → PostgreSQL + append-only application audit entries
Supabase private Storage (server-only service key, short-lived download links)
```

The browser never connects directly to ERP database tables. PostgreSQL row-level security is enabled with no public policies, denying Supabase anonymous/authenticated clients. The API connects with a private server database role permitted to access these tables. Organization scope is mandatory in repositories. Composite foreign keys prevent relationships crossing organizations.

## Shared hierarchy

Organizations contain business units, scoped users/roles, departments and operational records. A business unit has clients; clients have contracts and sites. Sites reference managers and supervisors. Dated site assignments connect employees and shifts to one or more sites. Employees reference their manager and supervisor. Both verticals reuse this hierarchy.

The organization root does not have a parent tenant. Permissions are a global immutable vocabulary. Other important records include organization IDs, UUIDs, creation/modification timestamps and actors. Soft-delete columns reserve archival support; workflow-sensitive records intentionally have no generic destructive delete endpoint.

## Code layout

- `apps/api/src/modules/auth`: sessions, HMAC token hashing, password authentication, granular permission checks, provisioning.
- `modules/resources`: explicit resource catalog, allowlisted validation, scoped queries and transactional writes. Dynamic Prisma access is contained in `lib/db.ts`.
- `modules/attendance`: hardware-independent tap ingestion and IST shift calculations.
- `modules/analytics`: scoped metrics, daily trends, site/client performance, state-duration machine uptime.
- `modules/documents`: private object storage and authorized downloads.
- `modules/reports`: CSV, Excel and PDF record exports.
- `modules/notifications`: idempotent in-app alert evaluation with a future delivery-channel field.
- `apps/web/src/components`: shell, dashboard, reusable records/forms, reports and administrative workflows.
- `packages/database/prisma`: normalized schema, versioned SQL migrations, synthetic seed.

## Authorization

Each request reloads the user's status and role permissions. A revoked user cannot continue using an existing session. Session tokens contain 384 random bits and are stored only as keyed hashes. HTTP-only, SameSite cookies expire after eight hours; production cookies are Secure. Writes require the configured Origin, preventing cross-origin cookie mutations.

Role scope is independent of permission: organization, business unit, or assigned sites. Worker permissions additionally constrain attendance, tasks, assignments and collections to their employee identity. A URL or foreign UUID never grants access. Relation changes on existing transactional records are blocked; create a new assignment or transaction instead of rewriting historical ownership.

New resources must define searchable fields, editable fields, display columns and direct or parent-derived scope. Add the permission vocabulary to seed/provisioning and explicitly grant it. Never add an unscoped Prisma endpoint or accept `organizationId`, audit actors, or arbitrary query objects from clients.

## Workflows

- **Waste:** collect → segregate → weigh → store. Disposal records deduct from available weight, validate vendor/site/business unit and mark fully disposed records. Weight is normalized to kilograms.
- **Assignments:** date windows and overlapping primary assignments are validated in a serializable transaction.
- **Attendance:** card and device identifiers are hashed; event IDs are idempotent; taps within 30 seconds are suppressed. Server checks timestamp skew, active worker/card/device and assignment. Manual entries require a reason. IST shift functions calculate late arrival, early departure and overtime.
- **Tickets:** forward-only open → assigned → in progress → resolved → closed, with reopening from resolved. Ownership is required before progression. Deadlines drive SLA alerts.
- **Production:** positive input, nonnegative output no greater than input, completion after start, one open batch per machine. Yield is derived, not independently editable.
- **Payments:** immutable receipts, unique transaction references, exact decimal balance checks and invoice status updates in the same serializable transaction. Conflicts return 409 for explicit retry.
- **Machine state:** a status change writes a machine event. Historical uptime integrates recorded durations and exposes history coverage, never assuming unrecorded time was running.

## NFC protocol

Register a reader with `POST /api/admin/devices`, then assign cards with `POST /api/admin/cards`. Protect the reader's one-time key. Readers post without a browser Origin to `/api/attendance/tap`, authenticating with `X-Device-Key`.

```json
{
  "eventId": "UUID generated once per physical event",
  "cardId": "hardware card identifier",
  "action": "CHECK_IN",
  "timestamp": "2026-09-15T08:00:00+05:30",
  "latitude": 19.1,
  "longitude": 72.9
}
```

Retry with the same event ID. Timestamp skew is limited to five minutes; offline backfill is intentionally not accepted through this endpoint. Device clocks require synchronization. Responses distinguish duplicate events from newly recorded attendance. Hardware transport (USB, serial, Ethernet, gateway) is independent of attendance domain code.

## Future extension points

`machine_events` has timestamped kind/state/JSON payload columns for future telemetry. No IoT ingestion or simulator is enabled. Add authenticated device ingestion, event schema versions, partitioning and retention before connecting hardware.

Structured analytics endpoints and stable event timestamps provide an AI input boundary. Existing site-volume alerts are deterministic comparisons against configured expectations, not machine-learning predictions. Predictive models, model evaluation, data consent, and automated actions are deliberately outside this first implementation.

Notifications reserve channel/delivery metadata for adapters. In-app evaluation is currently triggered with the Check alerts action/API. A production scheduled worker and durable outbox should own future email/WhatsApp delivery, retries and deduplication.

## Current operational boundaries

This is an initial deployable implementation, not an independently certified enterprise release. Validate with actual operations and load before production use. Current constraints include single-process rate limiting (put a shared gateway limiter in front of multiple replicas), bounded synchronous exports (10,000 rows), India/IST shift scheduling without holiday calendars, no payment reversal/credit-note workflow, no tax ledger, no payroll, no SSO/MFA/password recovery, no background notification worker, no antivirus scanning, and no offline attendance queue.

Document uploads support modern Office files (DOCX/XLSX), PDF and images; legacy DOC/XLS and macros are rejected. Content checks are basic signatures, not malware scanning. UI users need scoped read permission for a document's parent. Device provisioning exists; hardware pairing, key rotation UI and device fleet monitoring require operational integration.

PWA manifest and install metadata are included. Private operational data is not cached offline. Adding a service worker must preserve session revocation and data confidentiality; offline writes require conflict reconciliation.

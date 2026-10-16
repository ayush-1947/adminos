# AN Usedless Operations OS

A modular **Next.js + Express + Prisma/PostgreSQL** CRM and operations workspace for **AN Usedless Paper Private Limited**, sharing sites, workforce and clients between **Viagreen** and **Anthrasite**.

## Run locally

Requires Node.js 22+ and npm. On Windows PowerShell use `npm.cmd` if script execution policy blocks `npm`.

```sh
npm ci
npm run db:local
```

The optional local PostgreSQL helper listens only on `127.0.0.1:54329`. On first run it creates a gitignored `.env` with cryptographically generated local database, session and seed credentials. **Keep this terminal running.** It will not overwrite an existing `.env`. Open `.env` to find `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` for your local sign-in.

In another terminal:

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. The API listens on port 4000 and is proxied through Next.js. There is no public demo login or authentication bypass.

After first-time setup, use **`npm run dev`** (PowerShell: `npm.cmd run dev`). It automatically starts the embedded database in the background if your `.env` points to `localhost:54329`, waits for it to be ready, and reuses it if it is already running. Startup logs are in `.local/postgres-startup.log`. External PostgreSQL configurations are left untouched. If you run the API workspace command directly, start `npm run db:local` separately first.

### Use Supabase or your own PostgreSQL

Copy `.env.example` to `.env`; fill in all required values. Skip `db:local` and run generation, migrations, seed (development only), and dev as above. `DATABASE_URL` is the runtime connection; `DIRECT_URL` is the direct/session database connection used for migrations. With Supabase, use the appropriate project PostgreSQL connection strings with SSL. Keep both credentials exclusively on the server.

The seed is additive and rerunnable through deterministic IDs. It does not reset existing data or overwrite existing account credentials. It creates 2 business units, 10 fictional clients, 20 sites, 5 managers, 15 supervisors, 80 workers, 10 vendors, 10 machines, shifts, assignments and 30 days of attendance/waste/production records, plus tickets, visits, invoices, payments and maintenance examples. Names are synthetic and contact addresses use reserved example domains.

## Implemented workflows

- Organization/business-unit/site RBAC with six seeded roles and per-resource read/write permissions.
- Server-side sessions, password hashing, origin checks, rate limiting, structured errors, request IDs and audit logs.
- CRM clients, contacts, leads, follow-ups, contracts, sites and workforce hierarchy.
- Dated site assignments and shifts; manual attendance plus NFC device/card enrollment and replay-safe taps.
- Viagreen waste stage tracking, vendors, vehicles and quantity-controlled disposal.
- Anthrasite machine state history, production batches/yield, maintenance and spare parts.
- Tasks, site visits with GPS/checklists, complaints with controlled status transitions and SLA deadlines.
- Invoices, exact-decimal payments, outstanding balances, expenses and vendor payment status.
- Saved billing PDFs and delivery, waste-collection and waste-disposal e-challans, with repeat downloads and optional logo, addresses, GST breakdown, banking details and terms.
- Private Supabase documents, expiry metadata and short-lived downloads.
- In-app expiry/overdue alerts, scoped analytics and CSV/XLSX/PDF dataset exports.
- Report date shortcuts in IST and status filters, including issued, partially paid and paid invoices. Invoice status remains payment-controlled.
- Responsive dashboard, live data, search, filters, sorting, pagination, validated forms, dialogs, site activity and command navigation.
- Light/dark theme toggle on the login page and admin header, with saved preference and system-theme default.
- PWA manifest, Docker targets, migrations and CI configuration.

See [architecture](docs/architecture.md) for the domain rules and explicit implementation boundaries, and [deployment](docs/deployment.md) for production setup. This initial version still needs the operational acceptance and deployment checks listed there before being treated as production-ready.

## Commandsn

| Command                                    | Purpose                                     |
| ------------------------------------------ | ------------------------------------------- |
| `npm run dev`                              | Next frontend and API with reload           |
| `npm run build`                            | Compile API and production frontend         |
| `npm run typecheck`                        | Strict TypeScript checks                    |
| `npm test`                                 | Domain and PostgreSQL API integration tests |
| `npm run test:e2e`                         | Browser smoke tests against running app     |
| `npm run db:generate`                      | Generate Prisma client                      |
| `npm run db:migrate -- --name your_change` | Create development migrations               |
| `npm run db:deploy`                        | Apply committed migrations                  |
| `npm run db:seed`                          | Add development-only fixtures               |
| `npm run db:local`                         | Start optional local PostgreSQL             |

Integration tests create isolated temporary tenants in the configured database and remove only their own records. Use a dedicated test database in CI. Browser tests require a seeded development database and a running app; credentials are read from `.env`, never embedded in the tests.

## Environment

| Variable                    | Required   | Description                                                                                       |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | Production | `development`, `test`, `production`                                                               |
| `PORT`                      | No         | Express port; default `4000`                                                                      |
| `APP_ORIGIN`                | Yes        | Exact browser origin; HTTPS in production                                                         |
| `API_INTERNAL_URL`          | Web        | API address reachable from the Next server                                                        |
| `DATABASE_URL`              | Yes        | Private runtime PostgreSQL connection                                                             |
| `DIRECT_URL`                | Migrations | Direct/session-mode PostgreSQL connection                                                         |
| `SESSION_SECRET`            | Yes        | At least 48 characters of generated entropy; rotation revokes sessions and provisioned NFC hashes |
| `SEED_ADMIN_EMAIL`          | Seed only  | Initial development administrator                                                                 |
| `SEED_ADMIN_PASSWORD`       | Seed only  | At least 14 characters; never read by login logic                                                 |
| `SUPABASE_URL`              | Documents  | Project URL                                                                                       |
| `SUPABASE_SERVICE_ROLE_KEY` | Documents  | Private storage service key; never use `NEXT_PUBLIC_`                                             |
| `SUPABASE_STORAGE_BUCKET`   | Documents  | Private bucket, default `operations-documents`                                                    |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never commit `.env`, local database directories or authentication artifacts.

## API shape

### Billing and e-challan PDFs

Open **Finance → Invoices**, select a record, and use **Save PDF** or **Save & download PDF**. Open **E-challans** to create delivery, waste-collection or waste-disposal records and use the same PDF actions. The core record identifies the client, site, date and amount or material quantity; PDF customization fields are optional.

**Optional PDF details** supports a document-number override, issuer/recipient addresses and GSTINs, a PNG/JPEG logo (up to 120 KB), bank/account/IFSC/UPI information, terms and notes. For bills, an optional GST rate splits tax *within the existing total*; it does not increase the invoice or change payment balances. Confirm the applicable tax treatment before issuing a bill.

PDF bytes are stored privately in PostgreSQL, without requiring Supabase Storage. Identical content reuses its saved copy; changed content creates a new dated version. Downloads always recheck access to the original record. Database backups include these files. The detail view shows the latest 100 saved versions.

These operational challans are not government-issued documents. Government portal integration requires the specific authority/portal and its authorized API access; no government submission is performed.

### Endpoints

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/catalog` returns only permitted modules and form metadata.
- `GET|POST /api/resources/:module`, `GET|PATCH /api/resources/:module/:id`
- List query: `page`, `limit` (max 100), `search`, `sort`, `order`, `status`, `businessUnitId`, `siteId`, `from`, `to`.
- `GET /api/dashboard?from=<ISO>&to=<ISO>&businessUnitId=<UUID>`
- `GET /api/reports/:module/:format` (`csv`, `xlsx`, `pdf`)
- `POST /api/attendance/tap` with `X-Device-Key`
- `POST /api/documents` multipart; `GET /api/documents/:id/download`
- `GET|POST /api/billing/:key/:id/pdfs` (`key`: `invoices` or `challans`)
- `GET /api/saved-pdfs/:id/download` returns the saved PDF attachment
- `POST /api/notifications/refresh`, `PATCH /api/notifications/:id/read`
- `/api/admin/users`, `/api/admin/roles`, `/api/admin/devices`, `/api/admin/cards`
- `/api/health` liveness and `/api/ready` database readiness.

Mutating browser requests require an `Origin` matching `APP_ORIGIN`. Unknown fields are rejected. Invalid input returns 422, missing permissions 403, inaccessible records 404, and uniqueness/concurrency conflicts 409. Audit records contain before/after values and request IDs without passwords or session tokens.

## Manager, customer and accountant workspaces

Each login belongs to an organization. Operations Managers see their assigned sites (including multiple sites) and manage their supervisors and workers. Customers link to a client profile, see only that client's sites and current site teams, and create tickets or complaints; managers handle assignment and resolution. Accountants have organization-wide finance access to invoices, payments, expenses, challans and financial reports, without workforce editing or user administration.

In Settings, create an Operations Manager with a business unit and employee profile, a Customer with a business unit and client profile, or an Accountant with organization-wide access. Assign a manager to each site and link supervisors/workers through Workforce and Assignments.

For optional local demo accounts, set `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD`, `SEED_CUSTOMER_EMAIL` / `SEED_CUSTOMER_PASSWORD`, and `SEED_ACCOUNTANT_EMAIL` / `SEED_ACCOUNTANT_PASSWORD` in `.env`, then run `npm run db:deploy`, `npm run db:generate`, and `npm run db:seed`. Passwords need at least 14 characters. The seed preserves existing credentials and data; demo accounts are never created in production. All accounts use the same email/password login page. The demo manager has four sites; the demo customer has two sites.

## People profiles

Click a person's name in workforce, customer, vendor or contact lists, team cards, linked record fields, or the account menu to open their profile card. **Open full profile** provides a shareable `/profiles/:type/:id` page. Account profiles resolve to the linked employee or client so their details remain in one place.

Profiles show name, photo, phone, designation, email and available team details. Managers and organization administrators can edit profile information, attach documents/payslips, set monthly pay and record payments already made (no money transfer). Payment history records the amount, date, pay period, method and reference. Profile photos and files accept JPEG/PNG; documents and ID proofs also accept PDF, up to 10 MB. Files are stored privately in PostgreSQL and recheck access on every request. Existing Supabase documents continue using their existing secure downloads.

Customers can view government-ID details and proof images for staff currently assigned to their sites, as well as their own client profile. They can edit/upload their own client details and proof only. Staff pay, payment history, internal notes and other staff documents are withheld from customer responses and protected on direct file URLs. Ending an assignment removes customer access to that worker's profile and proof. Missing photos/details are shown as initials or ?Not provided?; no identity documents are fabricated.

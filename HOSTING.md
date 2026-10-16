# Hosting Operations OS

This guide deploys the existing Next.js frontend and Express API on an Ubuntu server using Docker Compose, a managed PostgreSQL database, and Caddy for HTTPS. Run the server commands on the Linux server, not in Windows Command Prompt. Replace every example value before use.

Traffic: `https://ops.yourcompany.com` → Caddy → Next.js on localhost:3000 → internal API → PostgreSQL.

## 1. Get the hosting resources

- An Ubuntu LTS VPS with SSH access and sufficient memory for the Docker/Next.js build. Measure actual usage before choosing production capacity.
- A domain or subdomain, such as `ops.yourcompany.com`.
- A separate managed PostgreSQL production database with automated backups.
- A Supabase project/private storage bucket if using the Supabase document-upload module.

Keep staging and production databases separate. The embedded development PostgreSQL database is not the production database.

## 2. Prepare the application source

This folder is currently not a Git repository. Create a private repository and upload the source, or transfer the source to the server using SFTP. Exclude `.env`, `.local`, `node_modules`, `.next`, and generated build files. Include `package-lock.json`, `Dockerfile`, `compose.yml`, `apps`, `packages`, and `scripts`.

Place the source in a directory such as `~/operations-os`. If using Git:

```bash
git clone <private-repository-url> ~/operations-os
cd ~/operations-os
```

## 3. Prepare the server

Install Git, Docker Engine with its Compose plugin, and Caddy using their official installation instructions:

- [Docker on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy installation](https://caddyserver.com/docs/install)

Use SSH keys. Allow public TCP ports 80 and 443, and restrict SSH to trusted administrators. Keep ports 3000, 4000 and PostgreSQL private. The supplied Compose file already binds port 3000 to localhost and keeps the API internal.

Verify Docker:

```bash
sudo docker run --rm hello-world
sudo docker compose version
```

## 4. Configure PostgreSQL and optional storage

Create a fresh production database. Get its runtime and migration connection strings, including the provider's SSL options. The API needs a server-only database role with the privileges required by the application's RLS setup; browser clients must never receive its credentials.

For Supabase, use a connection method reachable from your VPS. Direct connections and session pooling have different IPv4/IPv6 requirements; follow [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres). Use a migration-compatible direct/session connection for `DIRECT_URL`.

For Supabase document uploads, create a private `operations-documents` bucket and obtain the project's server-side service key. Profile attachments and saved billing PDFs also use PostgreSQL, so database backups must include this file data.

## 5. Create production settings

In `~/operations-os`, create `.env` with an editor. Do not copy the development credentials into production:

```dotenv
NODE_ENV=production
PORT=4000
APP_ORIGIN=https://ops.yourcompany.com
API_INTERNAL_URL=http://api:4000
DATABASE_URL=<production-runtime-connection-string>
DIRECT_URL=<production-migration-connection-string>
SESSION_SECRET=<new-random-secret>
POSTGRES_PASSWORD=<another-new-random-secret>
```

The current Compose file requires `POSTGRES_PASSWORD` during configuration parsing even when its optional local PostgreSQL service is unused. Set it, but do not enable the `local` profile for this managed-database deployment.

Generate each secret separately using `openssl rand -hex 48`. Protect the file:

```bash
chmod 600 .env
```

If using Supabase document storage, also add:

```dotenv
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<private-service-key>
SUPABASE_STORAGE_BUCKET=operations-documents
```

## 6. Build and migrate

```bash
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose run --rm migrate
```

Stop if any command fails. The Docker build installs dependencies, generates Prisma, and builds the API and frontend. It sets the frontend's internal API destination at build time.

Run the application's type checks, integration tests, and browser tests in staging before deploying live data. Tests need a dedicated test/staging database.

## 7. Create the first administrator

Temporarily add these settings to the server `.env` using an editor:

```dotenv
BOOTSTRAP_ORGANIZATION=AN Usedless Paper Private Limited
BOOTSTRAP_SLUG=an-usedless
BOOTSTRAP_ADMIN_NAME=Your Name
BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com
BOOTSTRAP_ADMIN_PASSWORD=<unique-password-at-least-14-characters>
```

Run once:

```bash
sudo docker compose run --rm migrate npm run provision
```

Save the credentials in a password manager, then remove the `BOOTSTRAP_*` lines before starting the API. Provisioning creates an organization, administrator, business units and initial roles. Configure the other roles' permissions before assigning users. It refuses to overwrite an existing organization.

Never run `db:seed`, `db:seed:passwords`, development migrations, resets, or `db push` against production.

## 8. Start the containers

```bash
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 api web migrate
curl -f http://127.0.0.1:3000/api/ready
```

The migration service should exit successfully; API and web should remain running. API and web have restart policies. Ensure Docker starts on server reboot.

## 9. Connect the domain and HTTPS

Create a DNS A record pointing `ops.yourcompany.com` to the VPS IPv4 address. Add an AAAA record only if the server has working IPv6.

With Caddy installed on the host, put this in `/etc/caddy/Caddyfile`, preserving any existing sites:

```caddyfile
ops.yourcompany.com {
    reverse_proxy 127.0.0.1:3000
}
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy obtains and renews HTTPS certificates when DNS and inbound ports are configured correctly. See [Caddy's HTTPS guide](https://caddyserver.com/docs/quick-starts/https). `APP_ORIGIN` must exactly match the public HTTPS origin, without a trailing slash.

## 10. Verify before inviting users

```bash
curl -f https://ops.yourcompany.com/api/health
curl -f https://ops.yourcompany.com/api/ready
```

Sign in with the newly provisioned administrator. Verify role permissions, organization/site isolation, workforce assignments, attendance, invoices, PDF downloads, private uploads, logout and mobile access. Confirm unauthorized users cannot retrieve private files. Pilot with a small operational group before wider rollout.

## 11. Backups, monitoring and updates

Enable database backups and test a restore. Monitor HTTPS availability, readiness, API errors, disk space and database/storage capacity. Configure log retention, ingress request limits and trusted edge rate limiting. The API currently leaves Express `trust proxy` disabled; review proxy/IP limiting behavior before launch, and use shared edge limiting before multiple replicas.

Before each update, test in staging, record the current release and confirm a recoverable backup. Keep versioned application images for rollback. After transferring or checking out the reviewed release:

```bash
sudo docker compose build
sudo docker compose run --rm migrate
sudo docker compose up -d --no-deps api web
sudo docker compose ps
```

Run health and browser checks again. Application rollback requires the previous images/source and compatibility with the migrated schema; database migrations need reviewed forward fixes rather than automatic reversal.

The existing deployment notes identify additional work for higher-risk environments: scheduled notifications, upload malware scanning, and the required MFA/SSO/recovery policy. See [docs/deployment.md](docs/deployment.md) for operational limits and release checks.

This document prepares the deployment process; it does not provision a server, buy a domain, or verify a live deployment.

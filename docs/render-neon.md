# Free deployment: Render + Neon

The root `render.yaml` creates two free Render Node web services in Singapore: frontend and API. PostgreSQL is hosted separately on Neon. No Supabase account is needed for the database. Supabase-backed document uploads remain optional and require separate storage configuration; PostgreSQL-backed profile attachments and billing PDFs use Neon.

## 1. Create Neon PostgreSQL

Create a free Neon project at https://neon.com, preferably in a region near Singapore. Copy its pooled connection string for `DATABASE_URL` and unpooled/direct connection string for `DIRECT_URL`. Retain the supplied SSL parameters. Use a dedicated production database, not one used by tests.

## 2. Upload source

Create an empty private GitHub repository. From Windows Command Prompt in the project directory, if the folder is not already a repository:

```cmd
git init
git add .
git commit -m "Configure Render and Neon deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the repository URL. The existing `.gitignore` excludes `.env` variants, dependencies and local database files. Never commit credentials.

## 3. Create Render services

At https://dashboard.render.com select New → Blueprint, connect the repository, and use the root `render.yaml`. Confirm both services show the Free plan. The file follows the [Render Blueprint specification](https://render.com/docs/blueprint-spec).

Supply these prompted values:

| Service  | Variable         | Value                                                 |
| -------- | ---------------- | ----------------------------------------------------- |
| API      | DATABASE_URL     | Neon pooled connection string                         |
| API      | DIRECT_URL       | Neon unpooled/direct connection string                |
| API      | APP_ORIGIN       | Frontend's exact HTTPS origin, without trailing slash |
| Frontend | API_INTERNAL_URL | API's HTTPS origin, without trailing slash            |

Render generates the API session secret. Leave `PORT` unset; Render supplies it. Build commands explicitly install development dependencies needed by TypeScript and Next.js.

You can enter the anticipated Render URLs initially, but verify the actual assigned URLs after creation: names can receive suffixes. Update `APP_ORIGIN` and redeploy the API if needed. Update `API_INTERNAL_URL` and rebuild/redeploy the frontend if needed; Next.js captures the rewrite destination during its build. Use the public HTTPS API URL, not a Docker service name or private hostname.

## 4. Apply migrations and provision an administrator

Before using the deployed application, create `.env.production` locally with an editor. Keep the existing local `.env` unchanged:

```dotenv
DATABASE_URL=<Neon pooled connection string>
DIRECT_URL=<Neon direct connection string>
BOOTSTRAP_ORGANIZATION=AN Usedless Paper Private Limited
BOOTSTRAP_SLUG=an-usedless
BOOTSTRAP_ADMIN_NAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=<your real email>
BOOTSTRAP_ADMIN_PASSWORD=<new strong password of at least 14 characters>
```

With dependencies installed and development servers stopped during any reinstall, run each command separately in Windows Command Prompt:

```cmd
npm run db:generate
node --env-file=.env.production node_modules/prisma/build/index.js migrate deploy --schema packages/database/prisma/schema.prisma
node --env-file=.env.production node_modules/tsx/dist/cli.mjs packages/database/prisma/provision.ts
```

Stop if a command fails. Provision only once for a new organization; configure other roles' permissions before assigning users. Save credentials securely and remove the bootstrap settings afterward. Never seed demo data into production. Local development records are not transferred automatically.

Migrations are deliberately separate from the Render build so a build/preview does not mutate production data. For subsequent releases, test in staging, confirm a backup, then apply reviewed production migrations once before releasing dependent application code. Free Render services do not provide the same release tooling as paid services.

## 5. Verify

### Opening the API service URL

The API service is separate from the frontend. Visiting its bare `/` URL redirects to the frontend configured by `APP_ORIGIN`; startup `HEAD /` requests return 200 without querying the database. Use `/api/health` for process liveness and `/api/ready` for a database check. Both probe endpoints are outside the application rate-limit quota, so infrastructure polling does not use that quota.

A successful build followed by repeated `/api/health` HTTP 200 entries shows a running API. Earlier releases returned 404 for bare `/` requests because they had no root page; that response alone did not indicate a crash. If the frontend works while proxied API calls return 502, compare direct API readiness with frontend readiness after startup recovery before changing the database or credentials.

### Intermittent "server unavailable" after inactivity

The Blueprint uses two Free web services. Render can spin each service down after 15 idle minutes and documents roughly one minute to start it again. The frontend may load while its API is still starting, so `/api/*` can temporarily return a gateway HTML response. The frontend now retries only safe reads with a bounded 90-second recovery budget, rejects HTML startup pages as API data, and checks API health before sending login credentials once. It does not automatically replay data-changing requests.

If the error persists after recovery finishes, inspect the API service's startup/runtime logs and verify both its direct `/api/health` and the frontend's `/api/ready`. Confirm `API_INTERNAL_URL` is the API's actual public HTTPS origin at frontend build time, and `APP_ORIGIN` is the frontend's exact HTTPS origin. Database readiness errors require checking Neon connectivity and connection limits. A 502 alone does not distinguish startup, a crashed process, or incorrect proxy configuration.

For an application that must remain available without idle startup delays, use an always-on service instance for the API and frontend. Changing a workspace plan alone does not change a service's compute plan. This code change does not upgrade or bill either service. See [Render's documented Free service limitations](https://render.com/docs/free).

Visit `https://YOUR-FRONTEND.onrender.com/api/ready` and check for success. Sign in with the production administrator and test role isolation, site assignments, invoices, PDF downloads, uploads and logout. Check both services' Render logs if readiness fails.

## Free plan limits

Render services can sleep and share a workspace free-hour allowance. First requests can be slow, and two services may consume the allowance faster. Neon has storage, compute and transfer limits. Check [Render free limits](https://render.com/docs/free) and [Neon pricing](https://neon.com/pricing) before launch. Back up real business data and measure workload before relying on free hosting for daily operations.

This configuration has not been deployed or verified against live Render/Neon accounts.

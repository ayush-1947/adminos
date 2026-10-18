# Staff attendance and FlowBridge release

Supervisor attendance uses the separate `staff_days` table. **Attendance** contains the supervisor's own start/stop workflow; **Staff attendance** contains only the worker/team sheet. Managers, business managers, accountants and Finance/Admin also use **Attendance** for their own manual marks. Accounts without employee profiles are supported.

Clicking Start time or Stop time captures the current location and opens a live camera preview. Front/back controls select the camera; a device with no rear camera reports that it is unavailable. There is no file picker or gallery-upload fallback. Capture photo and mark attendance takes a new JPEG from the live stream and refreshes the location before submitting. Streams stop on cancel, camera switch, successful submission and navigation. Camera errors and permission denial leave attendance unchanged. Use HTTPS and allow camera/location access.

The API continues to require an assigned active site, JPEG/PNG photo (up to 2 MB), coordinates captured within two minutes, GPS accuracy within 200 metres, and distance within 300 metres of the site's coordinates. Timestamps come from the server and work dates use IST. GPS and camera metadata are browser-supplied evidence, not proof against modified clients or device spoofing. Photos remain private PostgreSQL records with authenticated downloads.

**Super Admin > Work calendar** controls recurring working weekdays, a tracking start date, and individual holidays or special working dates. Date-specific overrides take precedence over the weekly schedule. Clearing an override restores the weekly rule. All seven days are working by default until the administrator configures the schedule; no weekend assumptions are made. The migration begins tracking at release for existing organizations; older dates are not automatically treated as missed. New-account checks begin no earlier than the account creation date. Admin changes are audited and apply across the organization; existing attendance evidence is retained.

A supervisor with a missing or unfinished previous working day sees **Fill sheet** in place of Start time. Selecting a past missed date also offers only Fill sheet. Non-working days and completed dates do not offer a sheet. Each outstanding day must have a submitted sheet before starting today; pending submissions count as submitted, and rejected sheets become outstanding again. A Stop time already in progress stays available even if the calendar subsequently changes. The API enforces these rules as well as the screen.

Sheets go to the reporting manager (then site manager, then another active Super Admin as fallback), with an in-app notification and review inbox. Only the reviewer or a Super Admin can approve/reject; self-review is forbidden. Approval records LEAVE without inventing missing clock times. Rejected requests can be resubmitted.

## FlowBridge integration

Adapted from `Anthrasite_FlowBridge_Source_Code.zip` into the existing Express API, shared authentication and organization-scoped database. The separate ZIP login/server is not started. Super Admin gets separate **Lead generation** and **FlowBridge** navigation entries and home shortcuts. Contacts, conversations, submissions, registration Flow download, campaign links/QR downloads, connection status and failed-event retry are available. The contact panel shows the latest submitted form; prior submissions remain in the private conversation message history. Lists show the latest 100 contacts/messages; they are not full historical exports.

Configure these privately on the API service:

- META_APP_SECRET
- META_VERIFY_TOKEN
- META_ACCESS_TOKEN
- META_PHONE_NUMBER_ID
- WHATSAPP_FLOW_ID
- META_GRAPH_API_VERSION (defaults to v23.0; select a version supported by your Meta app)
- FLOWBRIDGE_ORGANIZATION_ID
- FLOWBRIDGE_BUSINESS_UNIT_ID (must belong to that organization)

One WhatsApp business phone/organization is supported per API deployment. Configure Meta's webhook callback as `https://YOUR-API/api/flowbridge/webhook`, subscribe to messages, and use the matching verify token. The API verifies the raw body signature and phone metadata before queueing. Publish `flows/registration.json` in Meta and configure its published Flow ID. Do not use the callback as a Flow data-exchange endpoint: this is the terminal registration Flow from the supplied source.

The signature/challenge implementation follows [Meta's webhook reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/). Inbound messages are durably deduplicated; registrations create/update a WHATSAPP CRM lead in the configured business unit. Greeting messages queue a registration Flow reply. Outbound replies run only in response to customer enquiries. No marketing broadcast is implemented.

The worker starts only when all required Meta and organization settings are present, avoiding database polling before WhatsApp setup. A non-overlapping background worker claims queued events, retries up to five attempts with backoff, and recovers claims abandoned longer than five minutes. Processing failures are caught and secrets/payloads are not logged. Meta does not supply an outbound idempotency key here, so a network/DB failure after Meta accepts a reply can duplicate that reply on retry. Free hosting suspension pauses the worker until the API wakes; it does not provide continuous job processing. A provider delivery acknowledgement can arrive before the outbound row is persisted; status history is best effort.

## Deployment

1. Run typecheck, API tests, and production build against the local/staging database.
2. Apply `20261018070000_staff_attendance_flowbridge` and `20261018110000_work_calendar` using `prisma migrate deploy`. This migration adds tables only and preserves existing attendance, users and assignments.
3. Deploy the API and frontend together; the background worker requires the new tables.
4. Set the Meta environment configuration and publish/subscribe the Flow as above.
5. Test supervisor GPS/photo start/stop on an actual phone at an assigned site, manager review, and a real WhatsApp registration.

`npm run db:sync:accounts` is a targeted existing-account credential sync using the five SEED_* email/password pairs from the process environment. It requires all accounts in one organization and verifies Diya Patil's exact two-site/eight-worker access before writing. It resets only those passwords/statuses and revokes their sessions, preserving operational data. Never commit those environment values. It is separate from the development seed.

## Availability investigation

A local helper crash was identified in the existing startup log: `ERR_IPC_CHANNEL_CLOSED` while sending readiness after the parent closed IPC. The readiness send now handles this safely. Multipart uploads are bounded to four concurrent requests per API process to limit memory pressure. Production trusts one reverse proxy hop for per-client rate limiting; do not expose that configuration behind an untrusted additional proxy chain. FlowBridge worker errors are caught and its interval is stopped during shutdown.

The direct production API health/readiness and proxied frontend health probes timed out during this change. These observations alone do not prove a process crash. Render runtime logs and instance metrics are still needed to distinguish cold starts, memory exhaustion, database connectivity and proxy problems. Existing bounded frontend startup recovery remains in place.

## Local verification incident

A first run of the new test failed before a test organization was created, then its original cleanup accidentally issued undefined organization filters. Local lead, notification and audit rows were deleted before a foreign-key restriction stopped further cleanup. Production was not involved. Cleanup now allocates the isolated UUID before setup and checks it exists before deletion. The rerunnable development seed restored synthetic lead fixtures; deleted local notification/audit history cannot be reconstructed from that seed.

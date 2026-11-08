# Sudharsan Dental Clinic

Astro renders the website as static files. Cloudflare Pages Functions handle `POST /api/enquiry`; Cloudflare D1 stores enquiries. Astro's standalone dev server and preview do **not** run Pages Functions.

## Prerequisites

- Node.js 22.23.4 or newer and npm.
- A Cloudflare account with Pages, D1 and Turnstile; Wrangler CLI (for example `npx wrangler`).

Install dependencies with `npm install`. `npm run astro -- dev --background` serves the frontend at `http://localhost:4321/`, but not the API. Manage it with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## Cloudflare setup

1. Create a D1 database with `npx wrangler d1 create sudharsan-enquiries`. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with its ID. Create a **separate** preview database named `sudharsan-enquiries-preview`, and replace `REPLACE_WITH_PREVIEW_D1_DATABASE_ID` in the preview binding with its ID; never connect test traffic to production patient data. Wrangler configuration is the source of truth for Pages bindings: reconcile this file with any existing Pages project settings before deploying. Adjust the project name to match your Pages project.
2. Run `npx wrangler d1 migrations apply sudharsan-enquiries --remote` before deploying. Apply preview migrations separately with `npx wrangler d1 migrations apply sudharsan-enquiries-preview --env preview --remote`. Do not commit generated database state.
3. Create a Turnstile widget for the deployed hostname. Set `PUBLIC_TURNSTILE_SITE_KEY` as a **Pages build environment variable**; Astro embeds this public site key at build time. Add the matching `TURNSTILE_SECRET_KEY` as an encrypted Pages Function secret for each environment. Redeploy after setting these values. Configure allowed production and preview hostnames on the respective widgets. The endpoint checks the verified hostname and `appointment` action.
4. Configure a Cloudflare WAF rate-limiting rule before enabling the endpoint: match `http.request.uri.path eq "/api/enquiry" and http.request.method eq "POST"`, count requests by client IP, and block or challenge excessive requests. Start with a conservative limit such as 5 requests per IP per 10 minutes where the plan supports it; otherwise use the closest available period/threshold and tune for shared networks. Use proxied custom domains where your WAF rule can be enforced. Protect preview deployments with Cloudflare Access, and do not enable Turnstile for unprotected alternative hostnames such as `pages.dev`; verify that no alternate hostname can bypass your rate limits. Turnstile is mandatory but does not replace edge rate limiting.
5. Configure a Pages project to run `npm run build`, with output directory `dist`, and deploy the repository. Pages automatically discovers the root `functions/` directory. Serve only over HTTPS, and do not publish `.dev.vars`, local D1 files or secrets.

The committed Wrangler database IDs are intentionally placeholders: deployment is not ready until both real IDs are supplied. No Cloudflare resources are created by this repository.

## Enquiry behaviour and SMS

The API validates all inputs and Turnstile server-side, inserts the enquiry, then records notification status. There is no public read API or admin dashboard. Patient details are not logged. The form only reports success after a `201` response and explicitly asks the patient to call or WhatsApp because no real notification provider is integrated. If the connection fails, the result may be unknown; contact the clinic before retrying to avoid duplicate enquiries.

| Server environment variable | Purpose |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Required encrypted Turnstile secret. Never expose in frontend code. |
| `SMS_MODE` | `disabled` (default), `mock` (records `simulated`), or `mock_failure` (records `failed`). Unknown values record `failed`. |
| `SMS_API_KEY`, `SMS_API_SECRET` | Reserved encrypted server-side credentials for a future provider adapter; currently unused. |

`functions/lib/sms.ts` is the isolated adapter boundary. The destination is the clinic number, `919488417158`. No live SMS is sent in any mode. Integrating a provider requires a provider-specific implementation, secret configuration, appropriate consent/privacy review, and verified delivery receipts before recording `sent`. A provider's acceptance alone is not delivery confirmation. A failed notification does not roll back an enquiry; a failed status update leaves `pending` for operational review.

**Operational requirement:** Until a secure, authenticated staff workflow and a real notification provider are in place, staff must monitor D1 through authorized Cloudflare tooling. Do not present this as a production-ready booking system. Restrict D1 access and logs, establish a retention/deletion policy for personal data, and publish an appropriate privacy policy before collecting real enquiries. The message field is limited to 500 characters and asks patients not to enter sensitive medical information; it cannot guarantee that they will not do so.

## Local API development

1. Replace the placeholder D1 database ID in `wrangler.toml` (a real database ID is required for deployment). Run `npx wrangler d1 migrations apply sudharsan-enquiries --local` to initialize the separate local database.
2. Copy `.dev.vars.example` to `.dev.vars` for the **local test-only** Turnstile secret and mock SMS mode. Both `.dev.vars` and local D1 state are gitignored. Never use test keys in production.
3. Set `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` for the build (in PowerShell: `$env:PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'`). Run `npm run build`, then `npx wrangler pages dev dist`. Open the URL Wrangler prints. The test secret's special `example.com` response is accepted only when the request hostname is `localhost` or `127.0.0.1`. Rebuild without the test key before a production deployment.
4. In the local D1 database, inspect only test data with `npx wrangler d1 execute sudharsan-enquiries --local --command "SELECT id, status, notification_status FROM appointment_enquiries"`. To exercise a notification failure, set `SMS_MODE="mock_failure"` in `.dev.vars` and restart Wrangler.

## Verification

Run `npm run build`, `npx tsc --noEmit` and `node --test tests/enquiry.test.ts`. The tests use an in-memory SQLite database, a mocked Turnstile response and synthetic data; they cover valid submissions, missing name, invalid mobile, missing consent, unconfirmed treatment, malformed JSON, notification failure after insertion, and spam verification failure. They do not prove a real Cloudflare deployment, WAF rule, SMS delivery, or provider integration. After configuring Cloudflare, perform an end-to-end test with test data, inspect D1 using authorized tooling, and verify the WAF and Turnstile settings for each deployed hostname.

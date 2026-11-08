# Sudharsan Dental Clinic

Astro produces the static site. Cloudflare Pages Functions handle `POST /api/enquiry`; the application does not store enquiries or patient records. The API validates the form, verifies Turnstile and calls the SMS adapter. There is no dashboard or enquiry retrieval endpoint.

**Online enquiries are not ready for use:** no SMS provider has been chosen or implemented. The current adapter always returns unavailable, so no successful response or SMS is produced. Patients should call or WhatsApp the clinic. Choose a provider and implement its API before enabling the form.

## Local development

Use Node.js 22.23.4 or newer and `npm install`. `npm run astro -- dev --background` serves the frontend at `http://localhost:4321/`; manage it with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`. Astro's dev server and preview do not run Pages Functions.

For the Pages Function, copy `.dev.vars.example` to `.dev.vars` for a **local-only** Turnstile test secret. Set `PUBLIC_TURNSTILE_SITE_KEY` to Cloudflare's test site key for the build:

```powershell
$env:PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
npm run build
npx wrangler pages dev dist
```

Open the address printed by Wrangler. Use only synthetic data. The test secret's special `example.com` response is accepted only for `localhost` or `127.0.0.1`. The adapter still returns unavailable; automated tests inject a fake provider without enabling fake success on deployed endpoints. Remove the test build variable and rebuild before deploying.

## Deployment and security

1. Reconcile `wrangler.toml` with any existing Pages project configuration; it becomes the configuration source of truth. Configure the build command as `npm run build`, output directory `dist`, and HTTPS. Pages discovers the root `functions/` directory.
2. Create a Turnstile widget for the actual hostnames. Set its public `PUBLIC_TURNSTILE_SITE_KEY` as a Pages **build** variable and its matching `TURNSTILE_SECRET_KEY` as an encrypted Pages Function secret. Redeploy after changes. The endpoint checks the verified hostname and `appointment` action; it fails closed without the secret.
3. Before enabling submissions, configure and verify a Cloudflare WAF rate-limiting rule matching `http.request.uri.path eq "/api/enquiry" and http.request.method eq "POST"`, counting by client IP and blocking excessive requests. Start at 5 requests per IP per 10 minutes where supported; otherwise choose the closest available threshold and tune for shared networks. Apply it on every public production and preview hostname; use proxied custom domains where the WAF is enforceable, protect previews with Cloudflare Access, and ensure alternative hostnames cannot bypass the rule. **This rule must be created in Cloudflare; it is not provisioned or verified by this repository.** Turnstile does not replace rate limiting.
4. Configure the selected provider in `functions/lib/sms.ts` and store all provider credentials only as encrypted server-side Pages secrets. The notification must go to `CLINIC_SMS_DESTINATION` (`+919488417158`) and include the validated enquiry fields required for the clinic to respond. Implement the provider's actual authentication, sender/template and India-specific regulatory requirements. Return `accepted` only after a response explicitly confirms provider acceptance; this is **not** a delivery confirmation. Return `rejected` for definitive rejection, `unknown` for timeouts or ambiguous results, and `unavailable` for missing configuration. Do not log request content, credentials, or provider responses containing personal information. Remove the form's unavailable notice only after the provider is configured and tested.
5. Test using synthetic data, confirm an actual notification reaches the intended clinic number, and verify WAF and Turnstile protection on deployed hostnames. Complete privacy and consent review, including the SMS provider's processing and retention, before accepting real enquiries. SMS may contain personal data, treatment and the optional message; patients are reminded not to enter sensitive medical information. No application database is created.

Only a provider-confirmed acceptance yields a success response. Delivery is not guaranteed. If the connection or provider outcome is uncertain, the patient is told to call or WhatsApp before retrying to avoid duplicate notifications. Since no application record exists, unsuccessful or undelivered notifications cannot be recovered from the website.

`TURNSTILE_SECRET_KEY` is the only currently used server secret. `SMS_API_KEY` and `SMS_API_SECRET` are reserved placeholders in the adapter's configuration type and are not used until a provider is integrated; use the actual provider-specific secret names as needed. Do not commit `.dev.vars` or expose credentials through `PUBLIC_` variables.

If databases were created under the previous design, removing bindings and migration files does **not** delete them or their existing data. An authorized owner should assess retention and backups, and separately arrange deletion through Cloudflare if appropriate.

## Verification

Run `npx tsc --noEmit`, `node --test tests/enquiry.test.ts`, and `npm run build`. The tests use synthetic data and mocked Turnstile and SMS providers, covering validation, spam checks, accepted notifications, rejection, unavailable service and provider errors. They do not prove live delivery, production WAF configuration, or a real provider integration.

# Sudharsan Dental Clinic

An Astro static website for Sudharsan Dental Clinic in Krishnagiri. The appointment form prepares a WhatsApp message; the website does not submit or store enquiries.

## Local development

Use Node.js 22.23.4 or newer, then run `npm install`. Start the site with `npm run astro -- dev --background` and open the URL reported by Astro (normally `http://localhost:4321/`). Manage the server with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## WhatsApp enquiries

The form checks the patient's name, 10-digit Indian mobile number, selected treatment and consent in the browser. It opens a pre-filled message addressed to `919488417158` in WhatsApp. If the new tab is blocked, the patient can use the provided link to open the prepared message. The patient must press **Send** in WhatsApp; opening the message does not send an enquiry or confirm an appointment. The form remains filled so the patient can make corrections.

Patients should not enter sensitive medical information in the optional message. The message and phone number are passed to WhatsApp when its link is opened, and WhatsApp's own processing and retention apply. The site has no enquiry backend, SMS provider, Turnstile, database, or dashboard. The clinic's direct call and WhatsApp links remain available if JavaScript or WhatsApp is unavailable.

## Cloudflare Pages deployment

Deploy as a static site using `npm run build` and the `dist` output directory. `wrangler.toml` contains the Pages project name and output directory; reconcile it with the existing Pages project before deploying. No application secrets or environment variables are required for enquiries. Remove obsolete Turnstile and SMS settings or WAF rules for the old endpoint from the Cloudflare dashboard where applicable. Deploy over HTTPS and test the flow with synthetic information before use.

Removing the former database bindings and migrations does not delete any previously created Cloudflare databases or their data. An authorized owner should assess retention and backups and arrange deletion separately if appropriate.

## Verification

Run `npx tsc --noEmit`, `node --test tests/whatsapp-enquiry.test.ts`, and `npm run build`. Tests verify form validation and message encoding; they do not prove that a patient sent a message or that the clinic received it.

# Sudharsan Dental Clinic

Sudharsan Dental Clinic is a responsive, static website for a dental clinic in Krishnagiri, Tamil Nadu, India. It introduces the clinic, dentists, available treatments and contact information. Patients can use the appointment enquiry form to prepare a WhatsApp Click-to-Chat message to the clinic.

## Technology stack

- **Astro** for the static website and components.
- **TypeScript** for typed application logic.
- **Tailwind CSS** through the Tailwind Vite plugin, alongside component and global CSS.
- **Git and GitHub** for version control and hosting the repository.
- **Cloudflare Pages** for website hosting.

## Project structure

```text
src/
  components/          Homepage sections, navigation and reusable components
  data/services.ts     Treatment categories and options
  layouts/MainLayout.astro  Shared page layout and metadata
  lib/whatsapp-enquiry.ts  Enquiry validation and WhatsApp message construction
  pages/index.astro    Homepage
  styles/global.css    Global styles and design tokens
public/
  images/              Clinic and dentist images and other image assets
  favicon.svg          SVG favicon
  favicon.ico          Fallback favicon
tests/
  whatsapp-enquiry.test.ts  Enquiry validation and message tests
astro.config.mjs       Astro and Tailwind configuration
wrangler.toml          Cloudflare Pages project and output configuration
```

## Local development

Install Node.js **22.23.4 or newer** and npm. From the project directory, run:

```sh
npm install
npm run astro -- dev
```

Open the URL printed in the terminal, normally [http://localhost:4321/](http://localhost:4321/). If the port is in use, Astro may choose another one. Press **Ctrl+C** in that terminal to stop the server.

## WhatsApp enquiry flow

The form validates the patient's name, 10-digit Indian mobile number, selected treatment and consent in the browser. It then opens a pre-filled WhatsApp message addressed to **+91 94884 17158**. If the new tab is blocked, the patient can use the prepared-message link shown on the form.

The patient must manually press **Send** in WhatsApp. Opening WhatsApp does not mean an enquiry has been submitted, and the form does not confirm an appointment. Patients should not enter sensitive medical information in the optional message field.

The website has no enquiry database, SMS service, email notification system or admin dashboard. WhatsApp processes the message under its own terms; the website cannot confirm that a message was sent or received.

## Images and assets

Clinic photographs used in the hero and gallery, and the dentist profile images, are stored in `public/images/`. The About section currently uses `about-dentist-patient.jpeg`, an illustrative dental image, not a photograph of the clinic or its patients. `natural-smile.jpg` is a stock image asset and is not currently used by the About section.

To add or replace an image:

1. Put the approved image in `public/images/`. Use actual clinic or dentist photographs only with permission, and check the usage licence for stock images.
2. Update the image path and descriptive alt text in the relevant component: `Hero.astro`, `Gallery.astro`, `Dentists.astro` or `About.astro`. Update the image width and height attributes to match the new file.
3. Check the image on mobile and desktop. Do not describe illustrative images as photographs of the clinic, its patients or its staff.

For example, `public/images/waiting-area.jpeg` is referenced in an Astro component as:

```html
<img src="/images/waiting-area.jpeg" alt="Waiting area at Sudharsan Dental Clinic" width="1600" height="1429" />
```

The site icons are `public/favicon.svg` and `public/favicon.ico`; their references are in `src/layouts/MainLayout.astro`.

## Deployment

The intended hosting setup is **Cloudflare Pages Free**, using the [GitHub repository](https://github.com/prathibha-15/dental_clinic_website) and the `main` production branch.

- Live website: [sudharsan-dental-clinic.pages.dev](https://sudharsan-dental-clinic.pages.dev)
- Build command: `npm run build`
- Build output directory: `dist`

When the Pages project is connected to the repository and `main` is configured as its production branch, Cloudflare Pages automatically builds and deploys changes pushed to `main`. Confirm the plan, Git connection and build settings in the Cloudflare dashboard.

```sh
git add .
git commit -m "Describe your changes"
git push origin main
```

Review changes before committing, and check the Cloudflare Pages deployment status after pushing. The WhatsApp enquiry flow requires no application secrets or server-side configuration.

## Verification

Run these checks from the project directory:

```sh
npx tsc --noEmit
node --test
npm run build
```

The tests cover enquiry validation and WhatsApp message construction. They do not verify that a patient sent a message or that the clinic received it.

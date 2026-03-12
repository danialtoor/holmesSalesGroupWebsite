# Vercel Deploy Guide

## 1. Prepare Email Provider (Resend)

1. Create a Resend account.
2. Verify a sending domain in Resend (recommended) or use their testing sender while validating setup.
3. Generate an API key.
4. Decide your destination inbox (`CONTACT_TO_EMAIL`), e.g. Doug's email.

## 2. Import Repo Into Vercel

1. Push this repo to GitHub.
2. In Vercel, click `Add New...` -> `Project`.
3. Import this GitHub repo.
4. Keep defaults (no framework preset is required for this static site + `api/` function).

## 3. Set Environment Variables In Vercel

In `Project Settings` -> `Environment Variables`, add:

1. `RESEND_API_KEY`
2. `CONTACT_TO_EMAIL`
3. `CONTACT_FROM_EMAIL`

Use `.env.example` as reference values.

## 4. Deploy

1. Trigger deploy from Vercel dashboard (or push to `main` if auto-deploy is enabled).
2. Open the deployed URL.

## 5. Test The Lead Forms

1. Submit the homepage form.
2. Submit the homepage modal form.
3. Submit the calculator modal form.
4. Confirm:
   - browser shows success message
   - Doug receives the email
   - email includes UTM/source context

## 6. Point Custom Domain (Optional)

1. Add your custom domain in Vercel `Project Settings` -> `Domains`.
2. Update DNS records at your registrar to the values Vercel provides.

## Notes

1. Frontend already posts to `/api/contact`.
2. The serverless endpoint is implemented in `api/contact.js`.
3. Spam controls included:
   - honeypot field (`website`) on all lead forms
   - lightweight per-IP rate limit in function memory

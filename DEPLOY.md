# Deploying Costbook

Written the day the first deployment was prepared. Everything here was
checked against a real production build (`npm run build && npm run start`),
not assumed.

## The one distinction that bites

**Environment variables are read at two different times, and getting it wrong
fails silently.**

`NEXT_PUBLIC_` names are **inlined into the bundle at BUILD time**. Everything
else is read at **boot**. A host that injects env only at runtime will build a
bundle that still says `http://localhost:3000`, and the first sign of it is a
sitemap full of links to a laptop. Set every variable in the host's
environment settings *before* the first build, not after it.

## What to set

| Variable | When | If it is missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build | **The app refuses to start.** `supabaseConfigured()` throws in production rather than degrading to the in-memory book — a deploy that cannot reach its database must not serve one shared book to every visitor with every route open. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build | as above |
| `NEXT_PUBLIC_SITE_URL` | build | `robots.txt`, the sitemap, the social card and every absolute link say `http://localhost:3000`. Set it to `https://costbook.in`, with the scheme and no trailing slash. |
| `SUPABASE_SECRET_KEY` *(or `SUPABASE_SERVICE_ROLE_KEY`)* | boot | The payment callback answers 503 and logs it. Payments confirmed in the browser still work; payments whose browser went away are lost. Either name is read — Supabase renamed these in 2025. |
| `RAZORPAY_KEY_ID` | boot | No payment path. The plans page says so rather than pretending. |
| `RAZORPAY_KEY_SECRET` | boot | as above |
| `RAZORPAY_WEBHOOK_SECRET` | boot | The callback refuses **everything** with 503. An endpoint that switches paid plans on must be a closed door when it is not configured, never an open one. |
| `RESEND_API_KEY` | boot | Nothing is posted. A support reply is still delivered inside Costbook and its copy waits in `mail_outbox`, dated when it was written. |
| `MAIL_FROM` | boot | Falls back to `MAIL_SENDER` in `lib/org.ts`. |

**`COSTBOOK_BILLING_SANDBOX` must not be set in production.** It switches a
plan on with no payment. `sandboxAllowed()` also requires the request to have
arrived at localhost, so a stray flag cannot hand out free plans on a real
domain — but do not rely on the second lock for the first one's job.

## Before the first deploy

- **Node 20.9 or later.** Pinned in `package.json` `engines`; Next 16 requires it.
- **`xlsx` installs from `cdn.sheetjs.com`, not npm.** That is SheetJS's own
  distribution and the URL is pinned in `package-lock.json`, but it is a
  network fetch at install time — a build environment that blocks non-npm
  hosts will fail here and the message will not say why.
- **Nothing to register in Supabase Auth.** There are no email confirmation
  or password reset flows yet, so there are no redirect URLs to allow-list.

## After the first deploy

1. **Check `https://costbook.in/robots.txt`** — the `Sitemap:` line must say
   `https://costbook.in`, not localhost. If it does not, `NEXT_PUBLIC_SITE_URL`
   was set after the build rather than before it. Rebuild.
2. **Register the payment callback.** Razorpay → Settings → Webhooks → Add:
   - URL `https://costbook.in/api/razorpay/webhook`
   - Secret: the same string as `RAZORPAY_WEBHOOK_SECRET`
   - Event: `payment.captured`
   A `GET` on that URL answers `Costbook payment callback. It answers to POST.`
   — paste it in a browser to confirm the route is live before registering.
3. **Take one real payment on test keys**, close the tab before the redirect,
   and confirm the plan still switches on. That is the whole reason the
   callback exists and it is the one test worth doing by hand.
4. **Only then swap in `rzp_live_` keys** — and remember the webhook secret is
   per-endpoint, so a live endpoint is a second registration.

## What has already been proved

Against the real project, on a production build:

- `/api/auth/dev-login` answers 404 and `/dev-fault` is unreachable.
- Signed out: the public pages answer 200, every private one 307s to
  `/sign-in?next=…`.
- The webhook refuses a forged signature (401), applies a real payment,
  refuses the redelivery without stacking a second stretch, ignores an order
  it does not know, and refuses a part payment while leaving the order open.

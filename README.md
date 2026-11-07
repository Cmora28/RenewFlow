# RenewFlow

Recover failed subscription renewals before they turn into churn.

RenewFlow watches payment failures across billing providers, opens recovery
cases, and runs email dunning with payment-update links so revenue comes back
before customers disappear.

## Tech stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Prisma** + **PostgreSQL**
- **NextAuth** (credentials / bcrypt)
- **Stripe** (first provider) + provider-agnostic domain model
- **Resend** (email) when configured

## Local machine

This is not a public deployment. The app listens on `http://127.0.0.1:3010` and Postgres listens on `127.0.0.1:54329`, database `renewflow_local`. Nothing here is reachable from the internet. `npm run dev` on port 3000 is still available after you point the same local env file at it, but the generated profile uses 3010 so it does not attach to another app.

```bash
npm install
npm run local:setup    # writes .env.local; does not print secrets
npm run local:db       # Postgres 16 binaries, data in .local/pgdata
npm run local:migrate
npm run local:check
npm run dev -- --port 3010 --hostname 127.0.0.1
```

`npm run local:smoke` runs that sequence, starts `next start` on 3010, checks `/login`, `/signup`, an unauthenticated `POST /api/jobs/run` (401), and `/pay/update/not-a-token`, then stops the app. It does not call Stripe or Resend.

`.env.example` lists names and keeps values empty. `.env.local` is gitignored. The local checker refuses a non-loopback database, any port other than 54329, any database other than `renewflow_local`, a non-local `APP_URL`, `NODE_ENV=production` in that file, a live Stripe key, and `RESEND_API_KEY`. Leave the Stripe fields empty until a test key and a test webhook signing secret exist. Live webhook events are rejected by the app with no enablement variable.

`docker-compose.local.yml` describes the same Postgres on `127.0.0.1:54329`. It was not executed in the environment that added it, because Docker was not installed. `npm run local:db` is the path that was run.

`npm run local:db:down` stops only a data directory marked `RENEWFLOW_LOCAL`. It does not drop other databases.

Sign up at `http://127.0.0.1:3010/signup`.

## Public hosting

Not configured. This repository has no Dockerfile for the app, no `vercel.json`, and no other host manifest. A public URL does not exist. Do not register a domain or deploy from this setup. A later sandbox still needs an explicit choice: stay on this machine and forward webhooks with the Stripe CLI to `POST /api/webhooks/stripe`, or pick a Node.js and Postgres host that is not in the repo yet. Neither path is authorized by the local profile.

### Stripe keys

| Env var | Purpose |
|---------|---------|
| `STRIPE_SECRET_KEY` | Platform secret key (`lib/stripe.ts`) |
| `STRIPE_WEBHOOK_SECRET` | Verify `POST /api/webhooks/stripe` signatures |
| `STRIPE_CLIENT_ID` | Connect OAuth (`ca_...`) for **Connect with Stripe** |
| `CRON_SECRET` | Bearer token for `POST /api/jobs/run` (required everywhere) |

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Client setup (recommended):** Settings → **Connect with Stripe** (OAuth).  
No secret keys shared. Webhooks use Connect `event.account` → workspace.

**Platform setup:** enable Stripe Connect, set redirect URI to  
`/api/stripe/connect/callback`, and use a Connect-aware webhook endpoint.

## Recovery scope

A new failure schedules **one** immediate email. There is no 3-email / 10-day
sequence. The link opens Stripe's hosted invoice page for that invoice after
the token is checked. Updating a card, returning from a portal, or opening the
link does not mark the invoice paid. Closure requires a fully paid Stripe
invoice (`status=paid` and `amount_remaining=0`) on the connected account that
owns the workspace.

Webhook routing uses `event.account` only. Metadata-only and single-active
fallbacks are not used. Every `livemode: true` event is rejected before any
write. No environment variable turns that off.

`/api/jobs/run` always requires `Authorization: Bearer <CRON_SECRET>`.
A `?secret=` query parameter is ignored.

Delivery is not exactly-once. A timeout, network error, or missing provider id
does not call the provider again. A permanent rejection is not retried. A crash
before the handoff can retry the same payment-update token. A send already in
flight when the invoice becomes paid can still go out once.

## Later sandbox runbook

Not executed by CI. Do not use live keys, production data, or a real inbox
until that phase is separately approved.

1. Disposable Postgres and a Stripe **test** platform plus a disposable connected account.
2. Set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET` (test endpoint), `CRON_SECRET`. Leave `RESEND_API_KEY` unset so mail stays on the console. Live events are rejected even if a similarly named variable is present in the environment.
3. Point a test webhook at `POST /api/webhooks/stripe` (`stripe listen` or a test endpoint). Subscribe at least `invoice.payment_failed` and `invoice.paid`.
4. Connect the test account (OAuth or the manual test `acct_` id). The account id on the event must match that integration.
5. Fail a test renewal, call `POST /api/jobs/run` with the Bearer secret, and read the internal `/pay/update/...` URL from `MessageDelivery`, not from logs.
6. Pay the hosted invoice with a Stripe test card. Confirm the invoice is `PAID` and the case is `RECOVERED`. A later cron does not start a new email for actions that are still pending. A send already handed to the provider can still complete once.

Automated tests mock Stripe and Resend. A green CI run is not a sandbox payment.

## Plug in another provider

1. Implement `PaymentProviderService` under `lib/providers/<name>/` (see Stripe
   in `lib/providers/stripe/` and stubs in `paddle/` / `gocardless/`).
2. Register it in `lib/providers/registry.ts`.
3. Add a webhook route that verifies signatures, stores `ProviderEvent`
   idempotently, and enqueues work (mirror `/api/webhooks/stripe`).
4. Keep recovery in `lib/recovery/` — it only uses canonical
   `PaymentFailure` / `Invoice` / `Customer` models (no provider SDKs).

## Notable routes

| Path | Role |
|------|------|
| `/api/webhooks/stripe` | Signature verify → idempotent event → fast 2xx |
| `/api/jobs/run` | Bearer `CRON_SECRET`. Drains stranded Stripe events, then due recovery actions |
| `/pay/update/[token]` | Internal link. Redirects only to an allowlisted Stripe hosted invoice URL |
| `/dashboard`, `/recovery`, `/settings` | Authenticated app (workspace-scoped) |

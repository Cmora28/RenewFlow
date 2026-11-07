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

## Run locally

```bash
cp .env.example .env
# Required: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
# Stripe:   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
# Required for cron: CRON_SECRET (Bearer header; required in every environment)
# Optional: RESEND_API_KEY, EMAIL_FROM, APP_URL
# Do not set STRIPE_ALLOW_LIVEMODE for sandbox or local runs

npm install
npx prisma migrate dev
npm run dev
```

App: http://localhost:3000 · Sign up at `/signup`

### Stripe keys

| Env var | Purpose |
|---------|---------|
| `STRIPE_SECRET_KEY` | Platform secret key (`lib/stripe.ts`) |
| `STRIPE_WEBHOOK_SECRET` | Verify `POST /api/webhooks/stripe` signatures |
| `STRIPE_CLIENT_ID` | Connect OAuth (`ca_...`) for **Connect with Stripe** |
| `CRON_SECRET` | Bearer token for `POST /api/jobs/run` (required everywhere) |
| `STRIPE_ALLOW_LIVEMODE` | Exact `true` accepts live events. Leave unset. Not a production switch. |

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
fallbacks are not used. Live-mode events are rejected unless
`STRIPE_ALLOW_LIVEMODE` is exactly `true`.

`/api/jobs/run` always requires `Authorization: Bearer <CRON_SECRET>`.
A `?secret=` query parameter is ignored.

Delivery is not exactly-once. If the email provider accepts a message and the
process dies before the id is stored, the action is marked ambiguous and is
not sent again automatically. A send already in flight when the invoice
becomes paid can still go out once.

## Later sandbox runbook

Not executed by CI. Do not use live keys, production data, or a real inbox
until that phase is separately approved.

1. Disposable Postgres and a Stripe **test** platform plus a disposable connected account.
2. Set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET` (test endpoint), `CRON_SECRET`. Leave `RESEND_API_KEY` and `STRIPE_ALLOW_LIVEMODE` unset so mail stays on the console and live events are rejected.
3. Point a test webhook at `POST /api/webhooks/stripe` (`stripe listen` or a test endpoint). Subscribe at least `invoice.payment_failed` and `invoice.paid`.
4. Connect the test account (OAuth or the manual test `acct_` id). The account id on the event must match that integration.
5. Fail a test renewal, call `POST /api/jobs/run` with the Bearer secret, and read the internal `/pay/update/...` URL from `MessageDelivery`, not from logs.
6. Pay the hosted invoice with a Stripe test card. Confirm the invoice is `PAID`, the case is `RECOVERED`, and another cron run does not send.

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

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
# Optional: RESEND_API_KEY, EMAIL_FROM, CRON_SECRET, APP_URL

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

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Client setup (recommended):** Settings → **Connect with Stripe** (OAuth).  
No secret keys shared. Webhooks use Connect `event.account` → workspace.

**Platform setup:** enable Stripe Connect, set redirect URI to  
`/api/stripe/connect/callback`, and use a Connect-aware webhook endpoint.

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
| `/api/jobs/run` | Cron for due `RecoveryAction`s (`CRON_SECRET`) |
| `/dashboard`, `/recovery`, `/settings` | Authenticated app (workspace-scoped) |

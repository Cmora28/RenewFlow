# RenewFlow

Provider-agnostic payment recovery for subscription businesses.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Prisma** + **PostgreSQL**

## Getting started

```bash
cp .env.example .env
# set DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

npm install
npx prisma migrate dev
npm run dev
```

## Stripe webhooks

Endpoint: `POST /api/webhooks/stripe`

1. Verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET`
2. Idempotently stores the event in `ProviderEvent`
3. Enqueues background processing (responds 2xx immediately)
4. Maps `customer.*` / `invoice.*` into canonical records and recovery cases

Point your Stripe webhook (or `stripe listen --forward-to localhost:3000/api/webhooks/stripe`) at this route.

## Recovery engine

Provider-agnostic dunning lives under `lib/recovery/`:

- `createRecoveryCase(paymentFailure)` — opens a case + schedules initial email
- `scheduleAction({ scheduledFor })` — queue follow-up actions
- `executeAction(actionId)` — payment-update session + email + `MessageDelivery`
- `POST /api/jobs/run` — cron entrypoint for due `RecoveryAction`s

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/jobs/run"
```

Email uses Resend when `RESEND_API_KEY` is set; otherwise a console adapter logs sends.

## Project structure

```
app/          # Next.js App Router (marketing + authenticated app)
components/   # UI + app shell
lib/          # Shared utilities (Prisma client, providers, recovery)
prisma/       # schema + migrations
styles/       # Global CSS
```

### App routes

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing |
| `/dashboard` | Workspace recovery metrics |
| `/recovery` | Recovery case inbox |
| `/recovery/[id]` | Case detail + manual actions |
| `/settings` | Stripe connect + dunning sequence |

## Prisma scripts

| Script | Command |
|--------|---------|
| Generate client | `npm run db:generate` |
| Migrate | `npm run db:migrate` |
| Studio | `npm run db:studio` |

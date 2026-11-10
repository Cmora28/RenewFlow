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

## Project structure

```
app/          # Next.js App Router
components/   # Shared UI
lib/          # Shared utilities (Prisma client, etc.)
prisma/       # schema + migrations
styles/       # Global CSS
```

## Prisma scripts

| Script | Command |
|--------|---------|
| Generate client | `npm run db:generate` |
| Migrate | `npm run db:migrate` |
| Studio | `npm run db:studio` |

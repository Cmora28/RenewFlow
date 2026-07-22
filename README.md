# RenewFlow

Provider-agnostic payment recovery for subscription businesses.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind CSS)
- **Prisma** + **PostgreSQL**

## Getting started

```bash
cp .env.example .env
# set DATABASE_URL to your Postgres instance

npm install
npx prisma migrate dev
npm run dev
```

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

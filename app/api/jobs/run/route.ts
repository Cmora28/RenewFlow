import { NextResponse } from "next/server";

import { runDueRecoveryActions } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the recovery workflow engine.
 *
 * Secure with `CRON_SECRET`:
 *   Authorization: Bearer <CRON_SECRET>
 *   or `?secret=<CRON_SECRET>`
 *
 * Example:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://app.example.com/api/jobs/run"
 */
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(req);
  const result = await runDueRecoveryActions({ limit });

  return NextResponse.json({
    ok: true,
    job: "recovery_actions",
    ...result,
  });
}

/** Allow GET for simple cron providers that only support GET. */
export async function GET(req: Request) {
  return POST(req);
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed in production; allow open in development for local testing.
    return process.env.NODE_ENV !== "production";
  }

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) {
    return true;
  }

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

function parseLimit(req: Request): number {
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit");
  if (!raw) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

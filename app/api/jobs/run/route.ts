import { NextResponse } from "next/server";

import { runDueRecoveryActions } from "@/lib/recovery";
import { runJobsQuerySchema, zodErrorMessage } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint for the recovery workflow engine.
 *
 * Secure with `CRON_SECRET`:
 *   Authorization: Bearer <CRON_SECRET>
 *   or `?secret=<CRON_SECRET>`
 */
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = runJobsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    secret: url.searchParams.get("secret") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error) },
      { status: 400 },
    );
  }

  const result = await runDueRecoveryActions({ limit: parsed.data.limit });

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

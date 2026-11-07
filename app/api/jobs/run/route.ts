import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { drainStripeProviderEvents } from "@/lib/providers/stripe/webhook";
import { runDueRecoveryActions } from "@/lib/recovery";
import { runJobsQuerySchema, zodErrorMessage } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron entrypoint.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>` in every environment,
 * including development and test. Query-string secrets are ignored.
 *
 * Drains stranded Stripe provider events first, then due recovery actions,
 * so a webhook that only persisted a row can still open a case and send
 * the one MVP email on the same tick.
 */
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = runJobsQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error) },
      { status: 400 },
    );
  }

  const providerEvents = await drainStripeProviderEvents({
    limit: parsed.data.limit,
  });
  const recoveryActions = await runDueRecoveryActions({
    limit: parsed.data.limit,
  });

  return NextResponse.json({
    ok: true,
    providerEvents,
    recoveryActions,
  });
}

/** Allow GET for cron providers that can send an Authorization header. */
export async function GET(req: Request) {
  return POST(req);
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const token = header.slice("Bearer ".length);
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

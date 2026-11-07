import { NextResponse } from "next/server";

import { isStripeLivemodeAllowed } from "@/lib/providers/stripe/livemode";
import {
  ingestStripeWebhookEvent,
  StripeLivemodeRejectedError,
  StripeWebhookResolutionError,
  StripeWebhookVerificationError,
  verifyStripeWebhookEvent,
} from "@/lib/providers/stripe/webhook";

export const runtime = "nodejs";

/**
 * Stripe webhook endpoint (secure + fast).
 *
 * Security / reliability checklist:
 * - Reads **raw** body via `req.text()` (required for signature verification)
 * - Verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` → 400 on failure
 * - Idempotent `ProviderEvent` upsert keyed by Stripe `event.id`
 * - Enqueues heavy work; returns 2xx without awaiting recovery processing
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let stripeEvent;
  try {
    stripeEvent = verifyStripeWebhookEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof StripeWebhookVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (stripeEvent.livemode === true && !isStripeLivemodeAllowed()) {
    return NextResponse.json(
      { error: "Live mode Stripe events are rejected" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestStripeWebhookEvent(stripeEvent);
    return NextResponse.json(
      {
        received: true,
        skipped: result.skipped,
        reason: result.reason,
        providerEventId: result.providerEventId,
        workspaceId: result.workspaceId,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof StripeLivemodeRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof StripeWebhookResolutionError) {
      // Acknowledge receipt so Stripe does not retry endlessly for misconfig;
      // operators can inspect logs / ProviderEvent gaps.
      console.error("[stripe.webhook] resolution failed", error.message);
      return NextResponse.json(
        { received: true, skipped: true, error: error.message },
        { status: 202 },
      );
    }

    console.error("[stripe.webhook] ingest failed", error);
    return NextResponse.json(
      { error: "Failed to ingest Stripe webhook" },
      { status: 500 },
    );
  }
}

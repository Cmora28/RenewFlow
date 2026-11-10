import { NextResponse } from "next/server";

import {
  ingestStripeWebhookEvent,
  StripeWebhookResolutionError,
  StripeWebhookVerificationError,
  verifyStripeWebhookEvent,
} from "@/lib/providers/stripe/webhook";

export const runtime = "nodejs";

/**
 * Stripe webhook endpoint.
 *
 * Fast path: verify signature → persist ProviderEvent → enqueue work → 2xx.
 * Heavy mapping (Customer / Subscription / Invoice / recovery) runs in a
 * background job via {@link ingestStripeWebhookEvent}.
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

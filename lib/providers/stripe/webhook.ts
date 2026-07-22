import type { ProviderEvent } from "@prisma/client";
import type Stripe from "stripe";

import { enqueueBackgroundJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";
import { getStripeWebhookSecret, stripe } from "@/lib/stripe";

import { handleStripeEvent } from "./service";
import { resolveStripeIntegrationForEvent } from "./resolve-integration";

export class StripeWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookVerificationError";
  }
}

export class StripeWebhookResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookResolutionError";
  }
}

/**
 * Verify Stripe signature and parse the event from the raw request body.
 */
export function verifyStripeWebhookEvent(
  rawBody: string,
  signatureHeader: string | null,
): Stripe.Event {
  if (!signatureHeader) {
    throw new StripeWebhookVerificationError("Missing stripe-signature header");
  }

  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Stripe signature";
    throw new StripeWebhookVerificationError(message);
  }
}

export type IngestStripeWebhookResult = {
  providerEventId: string;
  workspaceId: string;
  skipped: boolean;
  reason?: "already_processed" | "already_queued";
};

/**
 * Persist the Stripe event idempotently and enqueue background processing.
 * Designed to return quickly so the HTTP handler can respond with 2xx.
 */
export async function ingestStripeWebhookEvent(
  stripeEvent: Stripe.Event,
): Promise<IngestStripeWebhookResult> {
  const integration = await resolveStripeIntegrationForEvent(stripeEvent);
  if (!integration) {
    throw new StripeWebhookResolutionError(
      "Unable to resolve workspace Stripe integration for event. " +
        "Connect the Stripe account via PaymentProviderIntegration.providerAccountId " +
        "or set metadata.workspaceId on Stripe objects.",
    );
  }

  const workspaceId = integration.workspaceId;

  const existing = await prisma.providerEvent.findUnique({
    where: {
      workspaceId_provider_providerEventId: {
        workspaceId,
        provider: "STRIPE",
        providerEventId: stripeEvent.id,
      },
    },
  });

  if (existing?.deliveryStatus === "PROCESSED" || existing?.processedAt) {
    return {
      providerEventId: existing.id,
      workspaceId,
      skipped: true,
      reason: "already_processed",
    };
  }

  if (
    existing &&
    (existing.deliveryStatus === "QUEUED" ||
      existing.deliveryStatus === "PROCESSING")
  ) {
    return {
      providerEventId: existing.id,
      workspaceId,
      skipped: true,
      reason: "already_queued",
    };
  }

  let providerEvent = existing;

  if (!providerEvent) {
    try {
      providerEvent = await prisma.providerEvent.create({
        data: {
          workspaceId,
          provider: "STRIPE",
          providerEventId: stripeEvent.id,
          eventType: stripeEvent.type,
          payloadJson: stripeEvent as unknown as object,
          deliveryStatus: "QUEUED",
        },
      });
    } catch (error) {
      // Concurrent delivery of the same Stripe event — re-read and honor idempotency.
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const raced = await prisma.providerEvent.findUnique({
        where: {
          workspaceId_provider_providerEventId: {
            workspaceId,
            provider: "STRIPE",
            providerEventId: stripeEvent.id,
          },
        },
      });

      if (!raced) {
        throw error;
      }

      if (raced.deliveryStatus === "PROCESSED" || raced.processedAt) {
        return {
          providerEventId: raced.id,
          workspaceId,
          skipped: true,
          reason: "already_processed",
        };
      }

      if (
        raced.deliveryStatus === "QUEUED" ||
        raced.deliveryStatus === "PROCESSING"
      ) {
        return {
          providerEventId: raced.id,
          workspaceId,
          skipped: true,
          reason: "already_queued",
        };
      }

      providerEvent = raced;
    }
  }

  if (
    providerEvent.deliveryStatus === "FAILED" ||
    providerEvent.deliveryStatus === "RECEIVED"
  ) {
    providerEvent = await prisma.providerEvent.update({
      where: { id: providerEvent.id },
      data: {
        deliveryStatus: "QUEUED",
        errorMessage: null,
        eventType: stripeEvent.type,
        payloadJson: stripeEvent as unknown as object,
      },
    });
  }

  enqueueBackgroundJob(() => processStripeProviderEvent(providerEvent.id));

  return {
    providerEventId: providerEvent.id,
    workspaceId,
    skipped: false,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Claim a stored ProviderEvent and run {@link handleStripeEvent}.
 * Safe to retry: uses an atomic status transition as the idempotency claim.
 */
export async function processStripeProviderEvent(
  providerEventId: string,
): Promise<void> {
  const claimed = await prisma.providerEvent.updateMany({
    where: {
      id: providerEventId,
      deliveryStatus: { in: ["QUEUED", "RECEIVED", "FAILED"] },
    },
    data: {
      deliveryStatus: "PROCESSING",
      errorMessage: null,
    },
  });

  if (claimed.count === 0) {
    return;
  }

  const providerEvent = await prisma.providerEvent.findUniqueOrThrow({
    where: { id: providerEventId },
  });

  try {
    await handleStripeEvent(providerEvent.workspaceId, providerEvent);

    await prisma.providerEvent.update({
      where: { id: providerEvent.id },
      data: {
        deliveryStatus: "PROCESSED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.providerEvent.update({
      where: { id: providerEvent.id },
      data: {
        deliveryStatus: "FAILED",
        errorMessage: message.slice(0, 2000),
      },
    });
    throw error;
  }
}

export type { ProviderEvent };

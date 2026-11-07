import type { ProviderEvent } from "@prisma/client";
import type Stripe from "stripe";

import {
  MAX_PROVIDER_EVENT_ATTEMPTS,
  PROCESSING_LEASE_MS,
} from "@/lib/jobs/limits";
import { enqueueBackgroundJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";
import { isStripeLivemodeAllowed } from "@/lib/providers/stripe/livemode";
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

export class StripeLivemodeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeLivemodeRejectedError";
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
  if (stripeEvent.livemode === true && !isStripeLivemodeAllowed()) {
    throw new StripeLivemodeRejectedError("Live mode Stripe events are rejected");
  }

  const integration = await resolveStripeIntegrationForEvent(stripeEvent);
  if (!integration) {
    throw new StripeWebhookResolutionError(
      "Unable to resolve a unique connected Stripe account for this event. " +
        "event.account must match one active integration, and metadata.workspaceId " +
        "must match that integration when it is present.",
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

  enqueueBackgroundJob(async () => {
    await processStripeProviderEvent(providerEvent.id);
  });

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

export type ProviderEventDrainResult = {
  scanned: number;
  processed: number;
  failed: number;
  skipped: number;
};

/**
 * Reclaim Stripe provider events left QUEUED, FAILED, or PROCESSING past the lease.
 * This is the crash recovery for `setImmediate`. Attempts are capped.
 */
export async function drainStripeProviderEvents(
  options: { limit?: number; leaseMs?: number } = {},
): Promise<ProviderEventDrainResult> {
  const limit = options.limit ?? 50;
  const leaseMs = options.leaseMs ?? PROCESSING_LEASE_MS;
  const staleBefore = new Date(Date.now() - leaseMs);

  const candidates = await prisma.providerEvent.findMany({
    where: {
      provider: "STRIPE",
      OR: [
        {
          deliveryStatus: { in: ["QUEUED", "RECEIVED", "FAILED"] },
          attemptCount: { lt: MAX_PROVIDER_EVENT_ATTEMPTS },
        },
        {
          deliveryStatus: "PROCESSING",
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
      ],
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  const result: ProviderEventDrainResult = {
    scanned: candidates.length,
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const outcome = await processStripeProviderEvent(candidate.id, { leaseMs });
    if (outcome === "processed") result.processed += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.skipped += 1;
  }

  return result;
}

/**
 * Claim a stored ProviderEvent and run {@link handleStripeEvent}.
 * The claim is compare-and-set. A second worker observes `skipped`.
 * Live-mode payloads are ignored with no recovery side effects when the
 * sandbox guard is closed.
 */
export async function processStripeProviderEvent(
  providerEventId: string,
  options: { leaseMs?: number } = {},
): Promise<"processed" | "skipped" | "failed"> {
  const leaseMs = options.leaseMs ?? PROCESSING_LEASE_MS;
  const staleBefore = new Date(Date.now() - leaseMs);

  const existing = await prisma.providerEvent.findUnique({
    where: { id: providerEventId },
  });
  if (!existing || existing.provider !== "STRIPE") {
    return "skipped";
  }

  const parsed = existing.payloadJson as unknown as Stripe.Event;
  if (parsed.livemode === true && !isStripeLivemodeAllowed()) {
    await prisma.providerEvent.updateMany({
      where: {
        id: providerEventId,
        deliveryStatus: { notIn: ["IGNORED", "PROCESSED"] },
      },
      data: {
        deliveryStatus: "IGNORED",
        errorMessage: "livemode_rejected",
        processedAt: new Date(),
      },
    });
    return "skipped";
  }

  const claimed = await prisma.providerEvent.updateMany({
    where: {
      id: providerEventId,
      OR: [
        {
          deliveryStatus: { in: ["QUEUED", "RECEIVED", "FAILED"] },
          attemptCount: { lt: MAX_PROVIDER_EVENT_ATTEMPTS },
        },
        {
          deliveryStatus: "PROCESSING",
          attemptCount: { lt: MAX_PROVIDER_EVENT_ATTEMPTS },
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
      ],
    },
    data: {
      deliveryStatus: "PROCESSING",
      lockedAt: new Date(),
      attemptCount: { increment: 1 },
      errorMessage: null,
    },
  });

  if (claimed.count === 0) {
    const closed = await prisma.providerEvent.updateMany({
      where: {
        id: providerEventId,
        deliveryStatus: "PROCESSING",
        attemptCount: { gte: MAX_PROVIDER_EVENT_ATTEMPTS },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      },
      data: {
        deliveryStatus: "FAILED",
        errorMessage: "max_attempts_reached",
        lockedAt: null,
      },
    });
    return closed.count > 0 ? "failed" : "skipped";
  }

  try {
    await handleStripeEvent(existing.workspaceId, {
      ...existing,
      deliveryStatus: "PROCESSING",
    });

    await prisma.providerEvent.update({
      where: { id: providerEventId },
      data: {
        deliveryStatus: "PROCESSED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });
    return "processed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const current = await prisma.providerEvent.findUnique({
      where: { id: providerEventId },
      select: { attemptCount: true },
    });
    const exhausted =
      (current?.attemptCount ?? MAX_PROVIDER_EVENT_ATTEMPTS) >=
      MAX_PROVIDER_EVENT_ATTEMPTS;
    await prisma.providerEvent.update({
      where: { id: providerEventId },
      data: {
        deliveryStatus: "FAILED",
        errorMessage: (exhausted ? `max_attempts_reached: ${message}` : message).slice(
          0,
          2000,
        ),
        lockedAt: null,
      },
    });
    return "failed";
  }
}

export type { ProviderEvent };

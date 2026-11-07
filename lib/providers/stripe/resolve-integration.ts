import type { PaymentProviderIntegration } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";

/**
 * Resolve the workspace Stripe integration for an inbound webhook.
 *
 * The connected account on `event.account` is required. Metadata and
 * "the only active integration" are not routing keys. If metadata carries
 * `workspaceId`, it must match the integration found for that account;
 * a mismatch is rejected instead of being attributed to either side.
 */
export async function resolveStripeIntegrationForEvent(
  event: Stripe.Event,
): Promise<PaymentProviderIntegration | null> {
  if (!event.account) {
    return null;
  }

  const matches = await prisma.paymentProviderIntegration.findMany({
    where: {
      provider: "STRIPE",
      providerAccountId: event.account,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    take: 2,
  });

  if (matches.length !== 1) {
    return null;
  }

  const integration = matches[0];
  if (!integration) {
    return null;
  }

  const metadataWorkspaceId = extractWorkspaceIdFromEventObject(event);
  if (metadataWorkspaceId && metadataWorkspaceId !== integration.workspaceId) {
    return null;
  }

  return integration;
}

function extractWorkspaceIdFromEventObject(event: Stripe.Event): string | null {
  const dataObject = event.data.object as {
    metadata?: Record<string, string> | null;
  };

  const workspaceId = dataObject.metadata?.workspaceId;
  return workspaceId && workspaceId.length > 0 ? workspaceId : null;
}

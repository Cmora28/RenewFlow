import type { PaymentProviderIntegration } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";

/**
 * Resolve the workspace Stripe integration for an inbound webhook event.
 *
 * Resolution order:
 * 1. Stripe Connect `event.account` → `PaymentProviderIntegration.providerAccountId`
 * 2. `workspaceId` metadata on the event object (if present)
 * 3. Single active Stripe integration (non-Connect / single-tenant setups)
 */
export async function resolveStripeIntegrationForEvent(
  event: Stripe.Event,
): Promise<PaymentProviderIntegration | null> {
  if (event.account) {
    const byAccount = await prisma.paymentProviderIntegration.findFirst({
      where: {
        provider: "STRIPE",
        providerAccountId: event.account,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (byAccount) {
      return byAccount;
    }
  }

  const metadataWorkspaceId = extractWorkspaceIdFromEventObject(event);
  if (metadataWorkspaceId) {
    const byWorkspace = await prisma.paymentProviderIntegration.findFirst({
      where: {
        workspaceId: metadataWorkspaceId,
        provider: "STRIPE",
        status: { in: ["ACTIVE", "PENDING"] },
      },
      orderBy: { updatedAt: "desc" },
    });
    if (byWorkspace) {
      return byWorkspace;
    }
  }

  const activeStripeIntegrations = await prisma.paymentProviderIntegration.findMany({
    where: {
      provider: "STRIPE",
      status: "ACTIVE",
    },
    take: 2,
  });

  if (activeStripeIntegrations.length === 1) {
    return activeStripeIntegrations[0] ?? null;
  }

  return null;
}

function extractWorkspaceIdFromEventObject(event: Stripe.Event): string | null {
  const dataObject = event.data.object as {
    metadata?: Record<string, string> | null;
  };

  const workspaceId = dataObject.metadata?.workspaceId;
  return workspaceId && workspaceId.length > 0 ? workspaceId : null;
}

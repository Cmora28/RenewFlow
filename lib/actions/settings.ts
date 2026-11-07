"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { revokeStripeConnectAccount } from "@/lib/providers/stripe/connect";
import {
  connectStripeSchema,
  formDataToObject,
  zodErrorMessage,
} from "@/lib/validation";
import { requireWorkspaceOwner } from "@/lib/workspace";

/**
 * Manual fallback: paste an account id (advanced / non-OAuth).
 * Prefer Stripe Connect OAuth via /api/stripe/connect/start.
 */
export async function connectStripeIntegration(formData: FormData) {
  try {
    const workspace = await requireWorkspaceOwner();
    const parsed = connectStripeSchema.safeParse(formDataToObject(formData));
    if (!parsed.success) {
      return { ok: false as const, error: zodErrorMessage(parsed.error) };
    }

    const accountId = parsed.data.providerAccountId;

    await prisma.paymentProviderIntegration.updateMany({
      where: {
        workspaceId: workspace.id,
        provider: "STRIPE",
        NOT: { providerAccountId: accountId },
        status: { in: ["ACTIVE", "PENDING"] },
      },
      data: { status: "DISABLED" },
    });

    await prisma.paymentProviderIntegration.upsert({
      where: {
        workspaceId_provider_providerAccountId: {
          workspaceId: workspace.id,
          provider: "STRIPE",
          providerAccountId: accountId,
        },
      },
      create: {
        workspaceId: workspace.id,
        provider: "STRIPE",
        providerAccountId: accountId,
        status: "ACTIVE",
        metadata: { connectedVia: "manual_account_id" },
      },
      update: {
        status: "ACTIVE",
        metadata: { connectedVia: "manual_account_id" },
      },
    });

    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_OWNER_ONLY") {
      return {
        ok: false as const,
        error: "Only workspace owners can modify provider integrations.",
      };
    }
    throw error;
  }
}

export async function disconnectStripeIntegration() {
  try {
    const workspace = await requireWorkspaceOwner();
    const integration = await prisma.paymentProviderIntegration.findFirst({
      where: {
        workspaceId: workspace.id,
        provider: "STRIPE",
        status: { in: ["ACTIVE", "PENDING"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!integration) {
      return { ok: false as const, error: "No active Stripe connection found." };
    }

    const meta =
      integration.metadata &&
      typeof integration.metadata === "object" &&
      !Array.isArray(integration.metadata)
        ? (integration.metadata as Record<string, unknown>)
        : {};

    const connectedViaOAuth =
      meta.connectedVia === "stripe_connect_oauth" ||
      (integration.credentials &&
        typeof integration.credentials === "object" &&
        !Array.isArray(integration.credentials) &&
        (integration.credentials as Record<string, unknown>).connectedVia ===
          "stripe_connect_oauth");

    if (connectedViaOAuth) {
      try {
        await revokeStripeConnectAccount(integration.providerAccountId);
      } catch (error) {
        // Still disable locally if Stripe revoke fails (already revoked, etc.)
        console.warn("[stripe.disconnect] deauthorize failed", error);
      }
    }

    await prisma.paymentProviderIntegration.update({
      where: { id: integration.id },
      data: {
        status: "DISABLED",
        metadata: {
          ...meta,
          disabledAt: new Date().toISOString(),
          disabledReason: "user_disconnect",
        },
      },
    });

    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_OWNER_ONLY") {
      return {
        ok: false as const,
        error: "Only workspace owners can modify provider integrations.",
      };
    }
    throw error;
  }
}


"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentWorkspace,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export async function connectStripeIntegration(formData: FormData) {
  try {
    const workspace = await requireWorkspaceOwner();
    const accountId = String(formData.get("providerAccountId") || "").trim();

    if (!accountId) {
      return { ok: false as const, error: "Stripe account id is required" };
    }

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
        metadata: { connectedVia: "settings_ui" },
      },
      update: {
        status: "ACTIVE",
        metadata: { connectedVia: "settings_ui" },
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

export async function saveRecoverySequence(formData: FormData) {
  try {
    const workspace = await requireWorkspaceOwner();
    const emailCount = Number(formData.get("emailCount") || 3);
    const spanDays = Number(formData.get("spanDays") || 10);

    if (
      !Number.isFinite(emailCount) ||
      !Number.isFinite(spanDays) ||
      emailCount < 1 ||
      emailCount > 10 ||
      spanDays < 1 ||
      spanDays > 60
    ) {
      return { ok: false as const, error: "Invalid recovery sequence values" };
    }

    const current =
      workspace.settings &&
      typeof workspace.settings === "object" &&
      !Array.isArray(workspace.settings)
        ? (workspace.settings as Record<string, unknown>)
        : {};

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        settings: {
          ...current,
          recoverySequence: { emailCount, spanDays },
        },
      },
    });

    revalidatePath("/settings");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_OWNER_ONLY") {
      return {
        ok: false as const,
        error: "Only workspace owners can modify global settings.",
      };
    }
    throw error;
  }
}

/** Read-only helper still used by settings page for non-owners. */
export async function getSettingsWorkspace() {
  return getCurrentWorkspace();
}

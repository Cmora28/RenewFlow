"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function connectStripeIntegration(formData: FormData) {
  const workspace = await getCurrentWorkspace();
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
}

export async function saveRecoverySequence(formData: FormData) {
  const workspace = await getCurrentWorkspace();
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
}

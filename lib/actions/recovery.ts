"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { executeAction, scheduleAction } from "@/lib/recovery";
import { invoiceBlocksDunning, isTerminalRecoveryCase } from "@/lib/recovery/status";
import {
  recoveryCaseIdSchema,
  zodErrorMessage,
} from "@/lib/validation";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function resendRecoveryEmail(recoveryCaseId: string) {
  const parsed = recoveryCaseIdSchema.safeParse({ recoveryCaseId });
  if (!parsed.success) {
    return { ok: false as const, error: zodErrorMessage(parsed.error) };
  }

  const workspace = await getCurrentWorkspace();
  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: {
      id: parsed.data.recoveryCaseId,
      workspaceId: workspace.id,
    },
    include: { invoice: { select: { status: true } } },
  });

  if (!recoveryCase) {
    return { ok: false as const, error: "Recovery case not found" };
  }

  if (
    isTerminalRecoveryCase(recoveryCase.status) ||
    invoiceBlocksDunning(recoveryCase.invoice?.status)
  ) {
    return {
      ok: false as const,
      error: "Recovery case is closed; email was not sent",
    };
  }

  const action = await scheduleAction({
    recoveryCaseId: recoveryCase.id,
    type: "send_email",
    scheduledFor: new Date(),
    metadata: { source: "manual_resend" },
  });

  const result = await executeAction(action.id);
  revalidatePath(`/recovery/${recoveryCase.id}`);
  revalidatePath("/recovery");

  return { ok: true as const, result };
}

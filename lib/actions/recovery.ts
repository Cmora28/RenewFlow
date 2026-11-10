"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { executeAction, scheduleAction } from "@/lib/recovery";
import { getCurrentWorkspace } from "@/lib/workspace";

export async function resendRecoveryEmail(recoveryCaseId: string) {
  const workspace = await getCurrentWorkspace();
  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { id: recoveryCaseId, workspaceId: workspace.id },
  });

  if (!recoveryCase) {
    return { ok: false as const, error: "Recovery case not found" };
  }

  const action = await scheduleAction({
    recoveryCaseId,
    type: "send_email",
    scheduledFor: new Date(),
    metadata: { source: "manual_resend" },
  });

  const result = await executeAction(action.id);
  revalidatePath(`/recovery/${recoveryCaseId}`);
  revalidatePath("/recovery");

  return { ok: true as const, result };
}

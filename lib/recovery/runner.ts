import { prisma } from "@/lib/prisma";

import { executeAction } from "./engine";
import type { RunDueActionsResult } from "./types";

/**
 * Find due RecoveryActions and execute them.
 * Intended to be invoked by `/api/jobs/run` (external cron) or a worker.
 *
 * Due criteria:
 * - status in PENDING | SCHEDULED
 * - scheduledAt is null or <= now
 */
export async function runDueRecoveryActions(
  options: { limit?: number } = {},
): Promise<RunDueActionsResult> {
  const limit = options.limit ?? 50;
  const now = new Date();

  const dueActions = await prisma.recoveryAction.findMany({
    where: {
      status: { in: ["PENDING", "SCHEDULED"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  const result: RunDueActionsResult = {
    scanned: dueActions.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const action of dueActions) {
    try {
      const outcome = await executeAction(action.id);
      result.processed += 1;
      if (outcome.status === "SUCCEEDED") result.succeeded += 1;
      else if (outcome.status === "FAILED") result.failed += 1;
      else result.skipped += 1;
    } catch (error) {
      result.processed += 1;
      result.failed += 1;
      result.errors.push({
        actionId: action.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

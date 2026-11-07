import {
  MAX_RECOVERY_ACTION_ATTEMPTS,
  PROCESSING_LEASE_MS,
} from "@/lib/jobs/limits";
import { prisma } from "@/lib/prisma";

import { executeAction } from "./engine";
import type { RunDueActionsResult } from "./types";

/**
 * Find due RecoveryActions and execute them.
 * Intended to be invoked by `/api/jobs/run` (external cron) or a worker.
 *
 * Due criteria:
 * - PENDING or SCHEDULED, due, under the attempt cap
 * - IN_PROGRESS whose lease has expired
 * FAILED is not selected: a provider exception is ambiguous or permanent and
 * is not sent again. A crash before handoff leaves IN_PROGRESS or PENDING.
 */
export async function runDueRecoveryActions(
  options: { limit?: number; leaseMs?: number } = {},
): Promise<RunDueActionsResult> {
  const limit = options.limit ?? 50;
  const leaseMs = options.leaseMs ?? PROCESSING_LEASE_MS;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - leaseMs);

  const dueActions = await prisma.recoveryAction.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "SCHEDULED"] },
          attemptCount: { lt: MAX_RECOVERY_ACTION_ATTEMPTS },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        {
          status: "IN_PROGRESS",
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
      ],
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
      const outcome = await executeAction(action.id, { leaseMs });
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

/**
 * Minimal in-process job enqueue for webhook side effects.
 *
 * TODO: replace setImmediate with a durable queue (SQS, BullMQ, Inngest, etc.)
 * for production. ProviderEvent rows remain the source of truth for retries
 * (drain QUEUED / FAILED via a worker if in-process jobs are dropped).
 */
export type BackgroundJob = () => Promise<void>;

export function enqueueBackgroundJob(job: BackgroundJob): void {
  // TODO: enqueue to durable job system instead of process-local setImmediate
  setImmediate(() => {
    void job().catch((error: unknown) => {
      console.error("[jobs] background job failed", error);
    });
  });
}

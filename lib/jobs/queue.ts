/**
 * Minimal in-process job enqueue for webhook side effects.
 *
 * Production deployments should swap this for a durable queue
 * (SQS, BullMQ, Inngest, etc.). Events remain durable in `ProviderEvent`,
 * so a worker can also drain `QUEUED` / `FAILED` rows safely.
 */
export type BackgroundJob = () => Promise<void>;

export function enqueueBackgroundJob(job: BackgroundJob): void {
  setImmediate(() => {
    void job().catch((error: unknown) => {
      console.error("[jobs] background job failed", error);
    });
  });
}

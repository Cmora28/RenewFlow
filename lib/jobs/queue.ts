/**
 * Best-effort in-process enqueue for webhook side effects.
 *
 * If the process dies after the webhook has stored `ProviderEvent` and
 * returned 2xx, `setImmediate` does not run. Crash recovery is the cron
 * drain in `drainStripeProviderEvents`, which reclaims QUEUED, FAILED, and
 * stale PROCESSING rows. This is not a durable external queue.
 */
export type BackgroundJob = () => Promise<void>;

function enqueueInline(job: BackgroundJob): void {
  setImmediate(() => {
    void job().catch((error: unknown) => {
      console.error("[jobs] background job failed", error);
    });
  });
}

let enqueueImpl: (job: BackgroundJob) => void = enqueueInline;

/** Test-only. Pass undefined to restore in-process enqueue. */
export function setBackgroundEnqueueForTests(
  impl: ((job: BackgroundJob) => void) | undefined,
): void {
  enqueueImpl = impl ?? enqueueInline;
}

export function enqueueBackgroundJob(job: BackgroundJob): void {
  enqueueImpl(job);
}

/** Cap for Stripe ProviderEvent processing attempts, including the first try. */
export const MAX_PROVIDER_EVENT_ATTEMPTS = 5;

/** Cap for recovery-action provider sends, including the first try. */
export const MAX_RECOVERY_ACTION_ATTEMPTS = 3;

/**
 * A PROCESSING / IN_PROGRESS row older than this may be reclaimed.
 * The claim is compare-and-set; a live worker that still holds a fresh lock is left alone.
 */
export const PROCESSING_LEASE_MS = 2 * 60 * 1000;

/** Stable action summary when a provider call may already have happened. */
export const AMBIGUOUS_DELIVERY_SUMMARY = "ambiguous_delivery_not_retried";

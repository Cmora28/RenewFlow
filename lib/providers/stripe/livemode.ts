/**
 * Live-mode Stripe events are rejected unless this variable is exactly `true`.
 * Sandbox, local, CI, and test runs leave it unset. Setting it is not a
 * production integration and is outside the current sandbox scope.
 */
export function isStripeLivemodeAllowed(): boolean {
  return process.env.STRIPE_ALLOW_LIVEMODE === "true";
}

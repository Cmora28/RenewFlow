import Stripe from "stripe";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

let stripeClientOverride: Stripe | undefined;

/** Test-only replacement. Production leaves this unset. */
export function setStripeClientForTests(client: Stripe | undefined): void {
  stripeClientOverride = client;
}

/** Test-only. Drops the cached client so the next getStripe() reads env again. */
export function resetStripeClientForTests(): void {
  stripeClientOverride = undefined;
  globalForStripe.stripe = undefined;
}

/** Reject live and unknown key prefixes before the Stripe client is constructed. */
export function assertStripeTestSecret(secretKey: string): void {
  if (secretKey.startsWith("sk_test_") || secretKey.startsWith("rk_test_")) {
    return;
  }
  throw new Error("STRIPE_SECRET_KEY must be a Stripe test key (sk_test_ or rk_test_)");
}

function createStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  assertStripeTestSecret(secretKey);

  return new Stripe(secretKey, {
    typescript: true,
  });
}

/**
 * Shared Stripe SDK client configured from `STRIPE_SECRET_KEY`.
 * Lazily initialized so importing this module during build does not require env.
 */
export function getStripe(): Stripe {
  if (stripeClientOverride) {
    return stripeClientOverride;
  }
  if (!globalForStripe.stripe) {
    globalForStripe.stripe = createStripeClient();
  }
  return globalForStripe.stripe;
}

/** @deprecated Prefer {@link getStripe} for lazy init; kept for ergonomic imports. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripe();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return secret;
}

export default stripe;

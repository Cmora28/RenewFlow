import { afterEach, describe, expect, it } from "vitest";

import { classifyEmailFailure } from "@/lib/recovery/email";
import {
  assertStripeTestSecret,
  getStripe,
  resetStripeClientForTests,
} from "@/lib/stripe";

const ORIGINAL = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  process.env.STRIPE_SECRET_KEY = ORIGINAL;
  resetStripeClientForTests();
});

describe("stripe test keys", () => {
  it("rejects live keys before constructing a client and does not echo the value", () => {
    const live = "sk_live_not_a_real_key";
    const restricted = "rk_live_not_a_real_key";
    for (const secret of [live, restricted, "sk_unknown_value"]) {
      expect(() => assertStripeTestSecret(secret)).toThrow(/test key/);
      try {
        assertStripeTestSecret(secret);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(secret);
      }
    }

    resetStripeClientForTests();
    process.env.STRIPE_SECRET_KEY = live;
    expect(() => getStripe()).toThrow(/test key/);
    try {
      getStripe();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(live);
    }
  });

  it("accepts sk_test_ and rk_test_ at initialization", () => {
    for (const secret of ["sk_test_ci_placeholder", "rk_test_ci_placeholder"]) {
      resetStripeClientForTests();
      process.env.STRIPE_SECRET_KEY = secret;
      expect(() => getStripe()).not.toThrow();
    }
  });
});

describe("email failure classification", () => {
  it("treats validation as permanent and timeouts as ambiguous", () => {
    expect(classifyEmailFailure({ name: "validation_error", statusCode: 422 })).toBe(
      "permanent",
    );
    expect(classifyEmailFailure({ name: "invalid_api_key", statusCode: 401 })).toBe(
      "permanent",
    );
    expect(classifyEmailFailure({ statusCode: 400 })).toBe("permanent");
    expect(classifyEmailFailure({ name: "internal_server_error", statusCode: 500 })).toBe(
      "ambiguous",
    );
    expect(classifyEmailFailure({ name: "rate_limit_exceeded", statusCode: 429 })).toBe(
      "ambiguous",
    );
    expect(classifyEmailFailure({ statusCode: null })).toBe("ambiguous");
    expect(classifyEmailFailure({ name: "concurrent_idempotent_requests", statusCode: 409 })).toBe(
      "ambiguous",
    );
  });
});

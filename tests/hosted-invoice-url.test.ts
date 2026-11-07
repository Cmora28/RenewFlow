import { describe, expect, it } from "vitest";

import { isAllowedStripeHostedInvoiceUrl } from "@/lib/recovery/hosted-invoice-url";
import { isStripeInvoiceFullyPaid } from "@/lib/providers/stripe/paid-state";

describe("hosted invoice allowlist", () => {
  it("accepts the Stripe hosted invoice origin", () => {
    expect(
      isAllowedStripeHostedInvoiceUrl("https://invoice.stripe.com/i/acct_test/invst_123"),
    ).toBe(true);
  });

  it("rejects unsafe or non-invoice URLs", () => {
    const rejected = [
      "http://invoice.stripe.com/i/abc",
      "https://invoice.stripe.com.evil.com/i/abc",
      "https://evil.example/invoice.stripe.com",
      "https://user:pass@invoice.stripe.com/i/abc",
      "https://invoice.stripe.com:8443/i/abc",
      "https://billing.stripe.com/p/session/test",
      "javascript:alert(1)",
      "https://invoice.stripe.com.evil.com",
      "",
    ];
    for (const url of rejected) {
      expect(isAllowedStripeHostedInvoiceUrl(url)).toBe(false);
    }
  });
});

describe("paid predicate", () => {
  it("requires paid status and a zero remaining amount", () => {
    expect(isStripeInvoiceFullyPaid({ status: "paid", amount_remaining: 0 })).toBe(true);
    expect(isStripeInvoiceFullyPaid({ status: "open", amount_remaining: 0 })).toBe(false);
    expect(isStripeInvoiceFullyPaid({ status: "paid", amount_remaining: 50 })).toBe(false);
    expect(isStripeInvoiceFullyPaid({ status: "paid", amount_remaining: null })).toBe(false);
    expect(isStripeInvoiceFullyPaid({ status: "open", amount_remaining: 500 })).toBe(false);
  });
});

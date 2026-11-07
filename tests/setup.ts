import Stripe from "stripe";
import { afterEach, beforeEach } from "vitest";

import { setBackgroundEnqueueForTests } from "@/lib/jobs/queue";
import { prisma } from "@/lib/prisma";
import {
  setAfterInvoiceLockForTests,
  setAfterInvoiceUpsertForTests,
} from "@/lib/providers/stripe/invoice-lock";
import { setAfterProviderClaimForTests } from "@/lib/providers/stripe/webhook";
import { setStripeClientForTests } from "@/lib/stripe";
import { ConsoleEmailService, setEmailServiceForTests } from "@/lib/recovery/email";
import { setBeforeProviderSendForTests } from "@/lib/recovery/engine";
import { setPaymentLinkLookupForTests } from "@/lib/recovery/payment-link";

const real = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_ci_placeholder", {
  telemetry: false,
});

const blockedResources = new Set([
  "invoices",
  "customers",
  "subscriptions",
  "oauth",
  "billingPortal",
  "paymentIntents",
  "charges",
  "accounts",
  "checkout",
  "setupIntents",
  "paymentMethods",
]);

const guarded = new Proxy(real, {
  get(target, prop, receiver) {
    if (typeof prop === "string" && blockedResources.has(prop)) {
      return new Proxy(
        {},
        {
          get(_target, method) {
            return () =>
              Promise.reject(
                new Error(`Blocked Stripe API ${String(prop)}.${String(method)}`),
              );
          },
        },
      );
    }
    const value = Reflect.get(target, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

setStripeClientForTests(guarded);

const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (/stripe\.com|resend\.com/i.test(url)) {
    throw new Error(`Blocked outbound test request to ${url}`);
  }
  return originalFetch(input, init);
}) as typeof fetch;

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "MessageDelivery",
      "PaymentUpdateSession",
      "RecoveryAction",
      "RecoveryCase",
      "PaymentFailure",
      "ProviderEvent",
      "MessageTemplate",
      "Invoice",
      "Subscription",
      "Customer",
      "PaymentProviderIntegration",
      "WorkspaceMember",
      "Workspace",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

beforeEach(async () => {
  setStripeClientForTests(guarded);
  setBackgroundEnqueueForTests(() => {});
  setEmailServiceForTests(new ConsoleEmailService());
  setPaymentLinkLookupForTests(undefined);
  setBeforeProviderSendForTests(undefined);
  setAfterInvoiceLockForTests(undefined);
  setAfterInvoiceUpsertForTests(undefined);
  setAfterProviderClaimForTests(undefined);
  await resetDatabase();
});

afterEach(() => {
  setBackgroundEnqueueForTests(undefined);
  setEmailServiceForTests(undefined);
  setPaymentLinkLookupForTests(undefined);
  setBeforeProviderSendForTests(undefined);
});

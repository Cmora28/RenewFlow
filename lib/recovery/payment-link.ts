import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isAllowedStripeHostedInvoiceUrl } from "@/lib/recovery/hosted-invoice-url";
import { invoiceBlocksDunning, isTerminalRecoveryCase } from "@/lib/recovery/status";

const sessionInclude = {
  customer: { include: { integration: true } },
  recoveryCase: { include: { invoice: true } },
} satisfies Prisma.PaymentUpdateSessionInclude;

type SessionWithBinding = Prisma.PaymentUpdateSessionGetPayload<{
  include: typeof sessionInclude;
}>;

export type HostedInvoiceSnapshot = {
  hostedInvoiceUrl: string | null;
  providerCustomerId: string | null;
  status: string | null;
  amountRemaining: number | null;
};

export type PaymentLinkLookup = (args: {
  stripeAccountId: string;
  providerInvoiceId: string;
}) => Promise<HostedInvoiceSnapshot>;

export type PaymentLinkResolution =
  | { outcome: "redirect"; url: string }
  | { outcome: "invalid" }
  | { outcome: "expired" }
  | { outcome: "terminal" }
  | { outcome: "already_paid" }
  | { outcome: "binding_mismatch" }
  | { outcome: "unsafe_url" }
  | { outcome: "unavailable" };

let lookupOverride: PaymentLinkLookup | undefined;

/** Test-only. Production uses the Stripe invoice retrieve below. */
export function setPaymentLinkLookupForTests(
  lookup: PaymentLinkLookup | undefined,
): void {
  lookupOverride = lookup;
}

/**
 * Resolve an internal payment-update token.
 * The connected account always comes from the workspace integration row.
 * Callers cannot pass an account id, return URL, or workspace id.
 * Opening the link never marks an invoice or recovery case paid.
 */
export async function resolvePaymentUpdateLink(
  token: string,
): Promise<PaymentLinkResolution> {
  if (!token) {
    return { outcome: "invalid" };
  }

  const session = await prisma.paymentUpdateSession.findUnique({
    where: { token },
    include: sessionInclude,
  });
  if (!session) {
    return { outcome: "invalid" };
  }

  if (session.status === "CANCELED") {
    return { outcome: "terminal" };
  }

  if (session.status === "EXPIRED" || session.expiresAt.getTime() <= Date.now()) {
    if (session.status !== "EXPIRED") {
      await prisma.paymentUpdateSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      });
    }
    return { outcome: "expired" };
  }

  const binding = bindingFailure(session);
  if (binding) {
    return { outcome: "binding_mismatch" };
  }

  const recoveryCase = session.recoveryCase;
  const invoice = recoveryCase?.invoice;
  if (!recoveryCase || !invoice) {
    return { outcome: "binding_mismatch" };
  }

  if (isTerminalRecoveryCase(recoveryCase.status)) {
    return { outcome: "terminal" };
  }

  if (invoiceBlocksDunning(invoice.status)) {
    return { outcome: "already_paid" };
  }

  const stripeAccountId = await connectedAccountIdForSession(session);
  if (!stripeAccountId) {
    return { outcome: "unavailable" };
  }

  let remote: HostedInvoiceSnapshot;
  try {
    const lookup = lookupOverride ?? defaultHostedInvoiceLookup;
    remote = await lookup({
      stripeAccountId,
      providerInvoiceId: invoice.providerInvoiceId,
    });
  } catch {
    return { outcome: "unavailable" };
  }

  if (
    !remote.providerCustomerId ||
    remote.providerCustomerId !== session.customer.providerCustomerId
  ) {
    return { outcome: "binding_mismatch" };
  }

  if (remote.status === "paid" && remote.amountRemaining === 0) {
    return { outcome: "already_paid" };
  }

  if (
    !remote.hostedInvoiceUrl ||
    !isAllowedStripeHostedInvoiceUrl(remote.hostedInvoiceUrl)
  ) {
    return { outcome: "unsafe_url" };
  }

  if (session.status === "PENDING") {
    await prisma.paymentUpdateSession.update({
      where: { id: session.id },
      data: { status: "OPEN" },
    });
  }

  return { outcome: "redirect", url: remote.hostedInvoiceUrl };
}

function bindingFailure(session: SessionWithBinding): boolean {
  const recoveryCase = session.recoveryCase;
  const invoice = recoveryCase?.invoice ?? null;
  if (!recoveryCase || !invoice) return true;
  if (session.customer.workspaceId !== session.workspaceId) return true;
  if (recoveryCase.workspaceId !== session.workspaceId) return true;
  if (recoveryCase.customerId !== session.customerId) return true;
  if (recoveryCase.customerId !== session.customer.id) return true;
  if (invoice.workspaceId !== session.workspaceId) return true;
  if (invoice.customerId !== session.customerId) return true;
  if (recoveryCase.invoiceId !== invoice.id) return true;
  return false;
}

async function connectedAccountIdForSession(
  session: SessionWithBinding,
): Promise<string | null> {
  const linked = session.customer.integration;
  if (session.customer.integrationId) {
    if (
      !linked ||
      linked.id !== session.customer.integrationId ||
      linked.workspaceId !== session.workspaceId ||
      linked.provider !== "STRIPE" ||
      (linked.status !== "ACTIVE" && linked.status !== "PENDING")
    ) {
      return null;
    }
    return linked.providerAccountId;
  }

  const integrations = await prisma.paymentProviderIntegration.findMany({
    where: {
      workspaceId: session.workspaceId,
      provider: "STRIPE",
      status: { in: ["ACTIVE", "PENDING"] },
    },
    take: 2,
  });
  if (integrations.length !== 1) {
    return null;
  }
  return integrations[0]?.providerAccountId ?? null;
}

async function defaultHostedInvoiceLookup(args: {
  stripeAccountId: string;
  providerInvoiceId: string;
}): Promise<HostedInvoiceSnapshot> {
  const { getStripe } = await import("@/lib/stripe");
  const { stripeAccountRequestOptions } = await import(
    "@/lib/providers/stripe/connect"
  );
  const invoice = await getStripe().invoices.retrieve(
    args.providerInvoiceId,
    undefined,
    stripeAccountRequestOptions(args.stripeAccountId),
  );
  const customer = invoice.customer;
  let providerCustomerId: string | null = null;
  if (typeof customer === "string") {
    providerCustomerId = customer;
  } else if (customer && !("deleted" in customer && customer.deleted)) {
    providerCustomerId = customer.id;
  }

  return {
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    providerCustomerId,
    status: invoice.status ?? null,
    amountRemaining: invoice.amount_remaining ?? null,
  };
}

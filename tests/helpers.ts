import { randomBytes } from "node:crypto";

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";

let sequence = 0;

export function nid(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence}_${randomBytes(3).toString("hex")}`;
}

export async function seedWorkspace(options?: { accountId?: string }) {
  const accountId = options?.accountId ?? nid("acct");
  const user = await prisma.user.create({
    data: {
      email: `${nid("user")}@example.test`,
      name: "Test User",
      passwordHash: "not-a-login",
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: "Workspace", slug: nid("ws") },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
  });
  const integration = await prisma.paymentProviderIntegration.create({
    data: {
      workspaceId: workspace.id,
      provider: "STRIPE",
      providerAccountId: accountId,
      status: "ACTIVE",
    },
  });
  const customer = await prisma.customer.create({
    data: {
      workspaceId: workspace.id,
      integrationId: integration.id,
      providerCustomerId: nid("cus"),
      email: `${nid("buyer")}@example.test`,
      name: "Buyer",
      currency: "USD",
    },
  });
  return { user, workspace, integration, customer, accountId };
}

export function invoiceEvent(args: {
  id?: string;
  type: string;
  account: string;
  customer: string;
  invoiceId?: string;
  status: string;
  amountRemaining: number;
  amountPaid?: number;
  amountDue?: number;
  livemode?: boolean;
  workspaceIdMetadata?: string;
}): Stripe.Event {
  return {
    id: args.id ?? nid("evt"),
    object: "event",
    api_version: "2026-01-28.clover",
    created: 1_700_000_000,
    livemode: args.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: args.type,
    account: args.account,
    data: {
      object: {
        id: args.invoiceId ?? "in_test",
        object: "invoice",
        customer: args.customer,
        customer_email: "buyer@example.test",
        currency: "usd",
        status: args.status,
        amount_due: args.amountDue ?? 2000,
        amount_paid: args.amountPaid ?? 0,
        amount_remaining: args.amountRemaining,
        attempt_count: 1,
        metadata: args.workspaceIdMetadata
          ? { workspaceId: args.workspaceIdMetadata }
          : {},
      },
    },
  } as Stripe.Event;
}

export async function seedRecoveryGraph(
  graph: Awaited<ReturnType<typeof seedWorkspace>>,
  options?: { caseStatus?: "OPEN" | "RECOVERED" | "CLOSED" | "ABANDONED"; invoiceStatus?: "OPEN" | "PAID" },
) {
  const invoice = await prisma.invoice.create({
    data: {
      workspaceId: graph.workspace.id,
      customerId: graph.customer.id,
      providerInvoiceId: nid("in"),
      status: options?.invoiceStatus ?? "OPEN",
      amountDue: "20.0000",
      amountPaid: options?.invoiceStatus === "PAID" ? "20.0000" : "0.0000",
      amountRemaining: options?.invoiceStatus === "PAID" ? "0.0000" : "20.0000",
      currency: "USD",
    },
  });
  const failure = await prisma.paymentFailure.create({
    data: {
      workspaceId: graph.workspace.id,
      customerId: graph.customer.id,
      invoiceId: invoice.id,
      status: options?.invoiceStatus === "PAID" ? "RECOVERED" : "OPEN",
      amount: "20.0000",
      currency: "USD",
      failedAt: new Date(),
    },
  });
  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      workspaceId: graph.workspace.id,
      customerId: graph.customer.id,
      invoiceId: invoice.id,
      paymentFailureId: failure.id,
      status: options?.caseStatus ?? "OPEN",
    },
  });
  const token = `tok_${randomBytes(18).toString("base64url")}`;
  const session = await prisma.paymentUpdateSession.create({
    data: {
      workspaceId: graph.workspace.id,
      customerId: graph.customer.id,
      recoveryCaseId: recoveryCase.id,
      token,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
      providerUrl: `http://localhost:3000/pay/update/${token}`,
    },
  });
  return { invoice, failure, recoveryCase, session, token };
}

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  resolvePaymentUpdateLink,
  setPaymentLinkLookupForTests,
  type HostedInvoiceSnapshot,
} from "@/lib/recovery/payment-link";

import { nid, seedRecoveryGraph, seedWorkspace } from "./helpers";

function safeRemote(
  customerId: string,
  overrides: Partial<HostedInvoiceSnapshot> = {},
): HostedInvoiceSnapshot {
  return {
    hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_test/invst_ok",
    providerCustomerId: customerId,
    status: "open",
    amountRemaining: 2000,
    ...overrides,
  };
}

describe("payment update token", () => {
  it("rejects an unknown token", async () => {
    const result = await resolvePaymentUpdateLink("missing-token-value");
    expect(result.outcome).toBe("invalid");
  });

  it("expires the session and does not call Stripe", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph);
    await prisma.paymentUpdateSession.update({
      where: { id: seeded.session.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    let calls = 0;
    setPaymentLinkLookupForTests(async () => {
      calls += 1;
      return safeRemote(graph.customer.providerCustomerId);
    });

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("expired");
    expect(calls).toBe(0);
    const session = await prisma.paymentUpdateSession.findUniqueOrThrow({
      where: { id: seeded.session.id },
    });
    expect(session.status).toBe("EXPIRED");
  });

  it("does not reopen a terminal case", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph, { caseStatus: "RECOVERED" });
    let calls = 0;
    setPaymentLinkLookupForTests(async () => {
      calls += 1;
      return safeRemote(graph.customer.providerCustomerId);
    });

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("terminal");
    expect(calls).toBe(0);
    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: seeded.recoveryCase.id },
    });
    expect(recoveryCase.status).toBe("RECOVERED");
  });

  it("rejects a token bound to another workspace invoice", async () => {
    const owner = await seedWorkspace({ accountId: "acct_owner" });
    const other = await seedWorkspace({ accountId: "acct_other" });
    const seeded = await seedRecoveryGraph(owner);
    await prisma.invoice.update({
      where: { id: seeded.invoice.id },
      data: { workspaceId: other.workspace.id },
    });
    let calls = 0;
    setPaymentLinkLookupForTests(async () => {
      calls += 1;
      return safeRemote(owner.customer.providerCustomerId);
    });

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("binding_mismatch");
    expect(calls).toBe(0);
  });

  it("uses the connected account from the integration, not the token text", async () => {
    const graph = await seedWorkspace({ accountId: "acct_real_connected" });
    const seeded = await seedRecoveryGraph(graph);
    const misleadingToken = "acct_attacker_supplied_value_not_used";
    await prisma.paymentUpdateSession.update({
      where: { id: seeded.session.id },
      data: { token: misleadingToken },
    });
    const seen: string[] = [];
    setPaymentLinkLookupForTests(async ({ stripeAccountId }) => {
      seen.push(stripeAccountId);
      return safeRemote(graph.customer.providerCustomerId);
    });

    const result = await resolvePaymentUpdateLink(misleadingToken);
    expect(result).toEqual({
      outcome: "redirect",
      url: "https://invoice.stripe.com/i/acct_test/invst_ok",
    });
    expect(seen).toEqual(["acct_real_connected"]);
  });

  it("rejects an unsafe hosted URL and does not mark the invoice paid", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph);
    setPaymentLinkLookupForTests(async () =>
      safeRemote(graph.customer.providerCustomerId, {
        hostedInvoiceUrl: "https://evil.example/pay",
      }),
    );

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("unsafe_url");
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: seeded.invoice.id },
    });
    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: seeded.recoveryCase.id },
    });
    expect(invoice.status).toBe("OPEN");
    expect(recoveryCase.status).toBe("OPEN");
  });

  it("redirects twice until paid without completing the session or the case", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph);
    setPaymentLinkLookupForTests(async () =>
      safeRemote(graph.customer.providerCustomerId),
    );

    const first = await resolvePaymentUpdateLink(seeded.token);
    const second = await resolvePaymentUpdateLink(seeded.token);
    expect(first.outcome).toBe("redirect");
    expect(second.outcome).toBe("redirect");

    const session = await prisma.paymentUpdateSession.findUniqueOrThrow({
      where: { id: seeded.session.id },
    });
    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: seeded.recoveryCase.id },
    });
    expect(session.status).toBe("OPEN");
    expect(recoveryCase.status).toBe("OPEN");
  });

  it("does not mark local state paid when Stripe already shows the invoice paid", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph);
    setPaymentLinkLookupForTests(async () =>
      safeRemote(graph.customer.providerCustomerId, {
        status: "paid",
        amountRemaining: 0,
      }),
    );

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("already_paid");
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: seeded.invoice.id },
    });
    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: seeded.recoveryCase.id },
    });
    expect(invoice.status).toBe("OPEN");
    expect(recoveryCase.status).toBe("OPEN");
  });

  it("rejects a remote customer that does not match the session", async () => {
    const graph = await seedWorkspace();
    const seeded = await seedRecoveryGraph(graph);
    setPaymentLinkLookupForTests(async () =>
      safeRemote(nid("cus_other")),
    );

    const result = await resolvePaymentUpdateLink(seeded.token);
    expect(result.outcome).toBe("binding_mismatch");
  });
});

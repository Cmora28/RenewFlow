import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  setAfterInvoiceLockForTests,
  setAfterInvoiceUpsertForTests,
} from "@/lib/providers/stripe/invoice-lock";
import {
  ingestStripeWebhookEvent,
  processStripeProviderEvent,
} from "@/lib/providers/stripe/webhook";

import { invoiceEvent, seedWorkspace } from "./helpers";

async function storedEvent(
  graph: Awaited<ReturnType<typeof seedWorkspace>>,
  event: ReturnType<typeof invoiceEvent>,
) {
  const ingested = await ingestStripeWebhookEvent(event);
  return ingested.providerEventId;
}

describe("invoice paid monotonicity", () => {
  it("keeps PAID when a stale failure is blocked behind the paid transaction", async () => {
    const graph = await seedWorkspace();
    const invoiceId = "in_race_paid_first";
    const paidId = await storedEvent(
      graph,
      invoiceEvent({
        type: "invoice.paid",
        account: graph.accountId,
        customer: graph.customer.providerCustomerId,
        invoiceId,
        status: "paid",
        amountRemaining: 0,
        amountPaid: 2000,
      }),
    );
    const failedId = await storedEvent(
      graph,
      invoiceEvent({
        type: "invoice.payment_failed",
        account: graph.accountId,
        customer: graph.customer.providerCustomerId,
        invoiceId,
        status: "open",
        amountRemaining: 2000,
        amountPaid: 0,
      }),
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let calls = 0;
    setAfterInvoiceLockForTests(async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        await gate;
      }
    });

    const paidRun = processStripeProviderEvent(paidId);
    await enteredPromise;
    const failedRun = processStripeProviderEvent(failedId);
    release();
    await Promise.all([paidRun, failedRun]);

    const invoice = await prisma.invoice.findFirstOrThrow();
    expect(invoice.status).toBe("PAID");
    expect(Number(invoice.amountRemaining)).toBe(0);
    expect(await prisma.recoveryCase.count()).toBe(0);
    expect(await prisma.recoveryAction.count()).toBe(0);
    expect(await prisma.messageDelivery.count()).toBe(0);
  });

  it("closes a case created while the paid event waited on the same invoice lock", async () => {
    const graph = await seedWorkspace();
    const invoiceId = "in_race_failed_first";
    const failedId = await storedEvent(
      graph,
      invoiceEvent({
        type: "invoice.payment_failed",
        account: graph.accountId,
        customer: graph.customer.providerCustomerId,
        invoiceId,
        status: "open",
        amountRemaining: 2000,
      }),
    );
    const paidId = await storedEvent(
      graph,
      invoiceEvent({
        type: "invoice.paid",
        account: graph.accountId,
        customer: graph.customer.providerCustomerId,
        invoiceId,
        status: "paid",
        amountRemaining: 0,
        amountPaid: 2000,
      }),
    );

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let calls = 0;
    setAfterInvoiceLockForTests(async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        await gate;
      }
    });

    const failedRun = processStripeProviderEvent(failedId);
    await enteredPromise;
    const paidRun = processStripeProviderEvent(paidId);
    release();
    await Promise.all([failedRun, paidRun]);

    expect((await prisma.invoice.findFirstOrThrow()).status).toBe("PAID");
    expect((await prisma.recoveryCase.findFirstOrThrow()).status).toBe("RECOVERED");
    expect((await prisma.paymentFailure.findFirstOrThrow()).status).toBe("RECOVERED");
    expect((await prisma.recoveryAction.findFirstOrThrow()).status).toBe("CANCELED");
    expect(await prisma.messageDelivery.count({ where: { status: "SENT" } })).toBe(0);
  });

  it("rolls back the invoice write when a later step in the transaction fails", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_rollback",
      status: "open",
      amountRemaining: 2000,
    });
    const id = await storedEvent(graph, event);
    setAfterInvoiceUpsertForTests(async () => {
      throw new Error("halfway");
    });

    const outcome = await processStripeProviderEvent(id);
    expect(outcome).toBe("failed");
    const stored = await prisma.providerEvent.findUniqueOrThrow({ where: { id } });
    expect(stored.errorMessage).toContain("halfway");
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.recoveryCase.count()).toBe(0);
    expect(await prisma.paymentFailure.count()).toBe(0);
    expect(await prisma.recoveryAction.count()).toBe(0);
  });
});

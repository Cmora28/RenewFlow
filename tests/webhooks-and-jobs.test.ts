import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as runJobs } from "@/app/api/jobs/run/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";
import { AMBIGUOUS_DELIVERY_SUMMARY } from "@/lib/jobs/limits";
import { prisma } from "@/lib/prisma";
import {
  drainStripeProviderEvents,
  ingestStripeWebhookEvent,
  processStripeProviderEvent,
} from "@/lib/providers/stripe/webhook";
import { resendRecoveryEmail } from "@/lib/actions/recovery";
import {
  setEmailServiceForTests,
  type EmailService,
  type SendEmailInput,
} from "@/lib/recovery/email";
import { setBeforeProviderSendForTests } from "@/lib/recovery/engine";
import { runDueRecoveryActions } from "@/lib/recovery/runner";
import { getCurrentWorkspace } from "@/lib/workspace";

import { invoiceEvent, seedWorkspace } from "./helpers";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/workspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workspace")>(
    "@/lib/workspace",
  );
  return {
    ...actual,
    getCurrentWorkspace: vi.fn(),
  };
});

class RecordingEmail implements EmailService {
  readonly sent: SendEmailInput[] = [];
  failTimes = 0;

  async send(input: SendEmailInput) {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      throw new Error("provider rejected");
    }
    this.sent.push(input);
    return {
      providerMessageId: `m_${this.sent.length}`,
      provider: "console" as const,
    };
  }
}

let email: RecordingEmail;

beforeEach(() => {
  email = new RecordingEmail();
  setEmailServiceForTests(email);
});

function sign(payload: string): string {
  return new Stripe("sk_test_ci_placeholder").webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_ci_placeholder",
  });
}

function webhookRequest(event: Stripe.Event, signature?: string | null) {
  const payload = JSON.stringify(event);
  const headers = new Headers();
  if (signature === undefined) {
    headers.set("stripe-signature", sign(payload));
  } else if (signature) {
    headers.set("stripe-signature", signature);
  }
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: payload,
  });
}

async function counts() {
  const [events, cases, failures, actions, deliveries, invoices] = await Promise.all([
    prisma.providerEvent.count(),
    prisma.recoveryCase.count(),
    prisma.paymentFailure.count(),
    prisma.recoveryAction.count(),
    prisma.messageDelivery.count(),
    prisma.invoice.count(),
  ]);
  return { events, cases, failures, actions, deliveries, invoices };
}

async function openFailure(graph: Awaited<ReturnType<typeof seedWorkspace>>, invoiceId = "in_1") {
  const event = invoiceEvent({
    type: "invoice.payment_failed",
    account: graph.accountId,
    customer: graph.customer.providerCustomerId,
    invoiceId,
    status: "open",
    amountRemaining: 2000,
    amountPaid: 0,
  });
  await ingestStripeWebhookEvent(event);
  await drainStripeProviderEvents();
  return event;
}

describe("stripe webhook guards", () => {
  it("stores nothing for a missing or invalid signature", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
    });

    const missing = await postWebhook(webhookRequest(event, null));
    const invalid = await postWebhook(webhookRequest(event, "t=1,v1=deadbeef"));

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(await counts()).toEqual({
      events: 0,
      cases: 0,
      failures: 0,
      actions: 0,
      deliveries: 0,
      invoices: 0,
    });
  });

  it("rejects live mode before any write", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
      livemode: true,
    });

    const response = await postWebhook(webhookRequest(event));
    expect(response.status).toBe(400);
    expect(await counts()).toMatchObject({ events: 0, cases: 0, invoices: 0 });
  });

  it("does not route on metadata or a single active integration", async () => {
    const only = await seedWorkspace({ accountId: "acct_only" });
    const missingAccount = invoiceEvent({
      type: "invoice.payment_failed",
      account: only.accountId,
      customer: only.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
      workspaceIdMetadata: only.workspace.id,
    });
    delete (missingAccount as { account?: string }).account;

    const missing = await postWebhook(webhookRequest(missingAccount));
    expect(missing.status).toBe(202);

    const other = await seedWorkspace({ accountId: "acct_other" });
    const mismatched = invoiceEvent({
      type: "invoice.payment_failed",
      account: only.accountId,
      customer: only.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
      workspaceIdMetadata: other.workspace.id,
    });
    const mismatch = await postWebhook(webhookRequest(mismatched));
    expect(mismatch.status).toBe(202);
    expect(await counts()).toMatchObject({ events: 0, cases: 0, invoices: 0 });
  });

  it("attributes a connected account only to its workspace", async () => {
    const owner = await seedWorkspace({ accountId: "acct_owner" });
    const other = await seedWorkspace({ accountId: "acct_other" });
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: owner.accountId,
      customer: owner.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
      workspaceIdMetadata: owner.workspace.id,
    });

    await ingestStripeWebhookEvent(event);
    await drainStripeProviderEvents();

    const cases = await prisma.recoveryCase.findMany();
    expect(cases).toHaveLength(1);
    expect(cases[0]?.workspaceId).toBe(owner.workspace.id);
    expect(cases.some((item) => item.workspaceId === other.workspace.id)).toBe(false);
    expect(await prisma.recoveryAction.count()).toBe(1);
  });
});

describe("paid state, order, and duplicates", () => {
  it("ignores a duplicate event id", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      id: "evt_same",
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
    });

    const first = await ingestStripeWebhookEvent(event);
    const second = await ingestStripeWebhookEvent(event);
    expect(first.skipped).toBe(false);
    expect(second).toMatchObject({ skipped: true, reason: "already_queued" });
    await drainStripeProviderEvents();
    const third = await ingestStripeWebhookEvent(event);
    expect(third).toMatchObject({ skipped: true, reason: "already_processed" });

    expect(await prisma.providerEvent.count()).toBe(1);
    expect(await prisma.recoveryCase.count()).toBe(1);
  });

  it("does not close an open invoice on a partial success", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const partial = invoiceEvent({
      type: "invoice.payment_succeeded",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_1",
      status: "open",
      amountRemaining: 500,
      amountPaid: 1500,
    });
    await ingestStripeWebhookEvent(partial);
    await drainStripeProviderEvents();

    const invoice = await prisma.invoice.findFirstOrThrow();
    const recoveryCase = await prisma.recoveryCase.findFirstOrThrow();
    expect(invoice.status).toBe("OPEN");
    expect(Number(invoice.amountRemaining)).toBe(5);
    expect(recoveryCase.status).toBe("OPEN");
  });

  it("does not close when remaining is zero but status is still open", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const odd = invoiceEvent({
      type: "invoice.payment_succeeded",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_1",
      status: "open",
      amountRemaining: 0,
      amountPaid: 2000,
    });
    await ingestStripeWebhookEvent(odd);
    await drainStripeProviderEvents();
    expect((await prisma.recoveryCase.findFirstOrThrow()).status).toBe("OPEN");
  });

  it("closes a fully paid invoice and cancels the pending email", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const paid = invoiceEvent({
      type: "invoice.paid",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_1",
      status: "paid",
      amountRemaining: 0,
      amountPaid: 2000,
    });
    await ingestStripeWebhookEvent(paid);
    await drainStripeProviderEvents();

    expect((await prisma.invoice.findFirstOrThrow()).status).toBe("PAID");
    expect((await prisma.paymentFailure.findFirstOrThrow()).status).toBe("RECOVERED");
    expect((await prisma.recoveryCase.findFirstOrThrow()).status).toBe("RECOVERED");
    expect((await prisma.recoveryAction.findFirstOrThrow()).status).toBe("CANCELED");

    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(0);
  });

  it("does not reopen or regress a paid invoice when a stale failure arrives", async () => {
    const graph = await seedWorkspace();
    const paid = invoiceEvent({
      type: "invoice.paid",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_1",
      status: "paid",
      amountRemaining: 0,
      amountPaid: 2000,
    });
    await ingestStripeWebhookEvent(paid);
    await drainStripeProviderEvents();

    const stale = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_1",
      status: "open",
      amountRemaining: 2000,
      amountPaid: 0,
    });
    await ingestStripeWebhookEvent(stale);
    await drainStripeProviderEvents();

    const invoice = await prisma.invoice.findFirstOrThrow();
    expect(invoice.status).toBe("PAID");
    expect(Number(invoice.amountRemaining)).toBe(0);
    expect(Number(invoice.amountPaid)).toBe(20);
    expect(await prisma.recoveryCase.count()).toBe(0);
  });

  it("keeps a second failure on an open invoice to the same case and one email", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph, "in_dup");
    const again = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_dup",
      status: "open",
      amountRemaining: 2000,
    });
    await ingestStripeWebhookEvent(again);
    await drainStripeProviderEvents();
    expect(await prisma.recoveryCase.count()).toBe(1);
    expect(await prisma.recoveryAction.count()).toBe(1);
  });
});

describe("jobs, claims, and delivery", () => {
  function jobsRequest(authorization?: string, query = "") {
    const headers = new Headers();
    if (authorization) headers.set("authorization", authorization);
    return new Request(`http://localhost:3000/api/jobs/run${query}`, {
      method: "POST",
      headers,
    });
  }

  it("rejects missing, wrong, and query-string credentials", async () => {
    const missing = await runJobs(jobsRequest());
    const wrong = await runJobs(jobsRequest("Bearer wrong-secret"));
    const query = await runJobs(
      jobsRequest(undefined, `?secret=${process.env.CRON_SECRET}`),
    );
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(query.status).toBe(401);

    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const closed = await runJobs(jobsRequest("Bearer anything"));
      expect(closed.status).toBe(401);
    } finally {
      process.env.CRON_SECRET = previous;
    }
  });

  it("sends the one MVP email from the cron and does not send it twice", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
    });
    await ingestStripeWebhookEvent(event);

    const response = await runJobs(
      jobsRequest(`Bearer ${process.env.CRON_SECRET}`),
    );
    expect(response.status).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.idempotencyKey).toMatch(/^recovery_action_/);
    expect(email.sent[0]?.text).toContain("/pay/update/");
    expect((await prisma.recoveryAction.findFirstOrThrow()).status).toBe("SUCCEEDED");
    expect((await prisma.messageDelivery.findFirstOrThrow()).status).toBe("SENT");

    await runJobs(jobsRequest(`Bearer ${process.env.CRON_SECRET}`));
    expect(email.sent).toHaveLength(1);
  });

  it("lets one of two concurrent claims process the event", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
    });
    const ingested = await ingestStripeWebhookEvent(event);
    const [first, second] = await Promise.all([
      processStripeProviderEvent(ingested.providerEventId),
      processStripeProviderEvent(ingested.providerEventId),
    ]);
    expect([first, second].sort()).toEqual(["processed", "skipped"]);
    expect(await prisma.recoveryCase.count()).toBe(1);
    const stored = await prisma.providerEvent.findUniqueOrThrow({
      where: { id: ingested.providerEventId },
    });
    expect(stored.attemptCount).toBe(1);
    expect(stored.deliveryStatus).toBe("PROCESSED");
  });

  it("recovers a stale queued event and stops after the attempt cap", async () => {
    const graph = await seedWorkspace();
    const event = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      status: "open",
      amountRemaining: 2000,
    });
    await prisma.providerEvent.create({
      data: {
        workspaceId: graph.workspace.id,
        provider: "STRIPE",
        providerEventId: event.id,
        eventType: event.type,
        payloadJson: event as unknown as object,
        deliveryStatus: "QUEUED",
      },
    });
    const drained = await drainStripeProviderEvents();
    expect(drained.processed).toBe(1);
    expect(await prisma.recoveryCase.count()).toBe(1);

    const broken = await prisma.providerEvent.create({
      data: {
        workspaceId: graph.workspace.id,
        provider: "STRIPE",
        providerEventId: "evt_broken",
        eventType: "invoice.payment_failed",
        payloadJson: { id: "evt_broken", type: "invoice.payment_failed", account: graph.accountId },
        deliveryStatus: "FAILED",
        attemptCount: 4,
      },
    });
    await drainStripeProviderEvents();
    const after = await prisma.providerEvent.findUniqueOrThrow({ where: { id: broken.id } });
    expect(after.attemptCount).toBe(5);
    expect(after.deliveryStatus).toBe("FAILED");
    expect(after.errorMessage).toContain("max_attempts_reached");

    await drainStripeProviderEvents();
    const stuck = await prisma.providerEvent.findUniqueOrThrow({ where: { id: broken.id } });
    expect(stuck.attemptCount).toBe(5);
  });

  it("does not steal a fresh processing lock, and reclaims a stale one", async () => {
    const graph = await seedWorkspace();
    const freshPayload = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_fresh",
      status: "open",
      amountRemaining: 2000,
    });
    const fresh = await prisma.providerEvent.create({
      data: {
        workspaceId: graph.workspace.id,
        provider: "STRIPE",
        providerEventId: freshPayload.id,
        eventType: freshPayload.type,
        payloadJson: freshPayload as unknown as object,
        deliveryStatus: "PROCESSING",
        lockedAt: new Date(),
        attemptCount: 1,
      },
    });
    await drainStripeProviderEvents();
    expect(
      (await prisma.providerEvent.findUniqueOrThrow({ where: { id: fresh.id } })).deliveryStatus,
    ).toBe("PROCESSING");
    expect(await prisma.recoveryCase.count()).toBe(0);

    const stalePayload = invoiceEvent({
      type: "invoice.payment_failed",
      account: graph.accountId,
      customer: graph.customer.providerCustomerId,
      invoiceId: "in_stale",
      status: "open",
      amountRemaining: 2000,
    });
    await prisma.providerEvent.create({
      data: {
        workspaceId: graph.workspace.id,
        provider: "STRIPE",
        providerEventId: stalePayload.id,
        eventType: stalePayload.type,
        payloadJson: stalePayload as unknown as object,
        deliveryStatus: "PROCESSING",
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
        attemptCount: 1,
      },
    });
    await drainStripeProviderEvents();
    expect(await prisma.recoveryCase.count()).toBe(1);
  });

  it("does not send again when a recorded delivery already exists", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const action = await prisma.recoveryAction.findFirstOrThrow();
    await prisma.recoveryAction.update({
      where: { id: action.id },
      data: {
        status: "IN_PROGRESS",
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });
    await prisma.messageDelivery.create({
      data: {
        workspaceId: graph.workspace.id,
        customerId: graph.customer.id,
        recoveryCaseId: action.recoveryCaseId,
        recoveryActionId: action.id,
        channel: "EMAIL",
        status: "SENT",
        toAddress: graph.customer.email,
        providerMessageId: "already_sent",
      },
    });

    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(0);
    expect((await prisma.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe(
      "SUCCEEDED",
    );
  });

  it("does not call the provider again for an ambiguous queued delivery", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const action = await prisma.recoveryAction.findFirstOrThrow();
    await prisma.recoveryAction.update({
      where: { id: action.id },
      data: {
        status: "IN_PROGRESS",
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });
    await prisma.messageDelivery.create({
      data: {
        workspaceId: graph.workspace.id,
        customerId: graph.customer.id,
        recoveryCaseId: action.recoveryCaseId,
        recoveryActionId: action.id,
        channel: "EMAIL",
        status: "QUEUED",
        toAddress: graph.customer.email,
      },
    });

    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(0);
    const updated = await prisma.recoveryAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.resultSummary).toBe(AMBIGUOUS_DELIVERY_SUMMARY);
    expect(updated.attemptCount).toBeGreaterThanOrEqual(3);
  });

  it("skips the provider when the case resolves before send", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    const action = await prisma.recoveryAction.findFirstOrThrow();
    setBeforeProviderSendForTests(async () => {
      await prisma.recoveryCase.update({
        where: { id: action.recoveryCaseId },
        data: { status: "RECOVERED", closedAt: new Date() },
      });
    });

    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(0);
    expect((await prisma.recoveryAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe(
      "SKIPPED",
    );
    expect((await prisma.messageDelivery.findFirstOrThrow()).status).toBe("CANCELED");
  });

  it("retries a provider failure and then stops sending for a terminal case", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    email.failTimes = 1;
    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(0);
    expect((await prisma.recoveryAction.findFirstOrThrow()).status).toBe("FAILED");
    expect((await prisma.messageDelivery.findFirstOrThrow()).status).toBe("FAILED");

    await runDueRecoveryActions();
    expect(email.sent).toHaveLength(1);

    await prisma.recoveryCase.updateMany({ data: { status: "RECOVERED" } });
    vi.mocked(getCurrentWorkspace).mockResolvedValue({
      id: graph.workspace.id,
      role: "OWNER",
    } as Awaited<ReturnType<typeof getCurrentWorkspace>>);
    const blocked = await resendRecoveryEmail(
      (await prisma.recoveryCase.findFirstOrThrow()).id,
    );
    expect(blocked).toEqual({
      ok: false,
      error: "Recovery case is closed; email was not sent",
    });
    expect(email.sent).toHaveLength(1);
    expect(await prisma.messageDelivery.count({ where: { status: "SENT" } })).toBe(1);
  });

  it("still allows one manual resend while the case is open", async () => {
    const graph = await seedWorkspace();
    await openFailure(graph);
    vi.mocked(getCurrentWorkspace).mockResolvedValue({
      id: graph.workspace.id,
      role: "OWNER",
    } as Awaited<ReturnType<typeof getCurrentWorkspace>>);

    const result = await resendRecoveryEmail(
      (await prisma.recoveryCase.findFirstOrThrow()).id,
    );
    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(await prisma.recoveryAction.count()).toBe(2);
  });
});

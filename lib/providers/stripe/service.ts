import type {
  BillingInterval,
  InvoiceStatus,
  Prisma,
  ProviderEvent,
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { isStripeInvoiceFullyPaid } from "@/lib/providers/stripe/paid-state";
import { createRecoveryCase } from "@/lib/recovery";

import type {
  CanonicalCustomerInput,
  CanonicalInvoiceInput,
  CanonicalSubscriptionInput,
  HandleEventResult,
  PaymentProviderService,
  ProviderIntegrationRef,
  SyncResult,
} from "../types";
import { PaymentProvider } from "../types";
import { stripeAccountRequestOptions } from "./connect";

/**
 * Stripe implementation of {@link PaymentProviderService}.
 * All Stripe SDK usage and payload mapping stay in `lib/providers/stripe/*`.
 * Connected-account calls use the platform key + `stripeAccount` header.
 */
export class StripeProviderService implements PaymentProviderService {
  readonly provider = PaymentProvider.Stripe;

  constructor(
    private readonly stripe: Stripe,
    private readonly integration: ProviderIntegrationRef,
  ) {}

  /** Scope platform API calls to the connected Stripe account. */
  private get accountOpts() {
    return stripeAccountRequestOptions(this.integration.providerAccountId);
  }

  async syncCustomers(workspaceId: string): Promise<SyncResult> {
    const result = emptySyncResult(workspaceId, this.provider);

    for await (const stripeCustomer of this.stripe.customers.list(
      { limit: 100 },
      this.accountOpts,
    )) {
      if (stripeCustomer.deleted) {
        result.skipped += 1;
        continue;
      }

      try {
        const input = this.normalizeCustomer(workspaceId, stripeCustomer);
        const outcome = await this.upsertCustomer(input);
        result.synced += 1;
        if (outcome.outcome === "created") result.created += 1;
        else result.updated += 1;
      } catch (error) {
        result.errors.push({
          providerObjectId: stripeCustomer.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async syncSubscriptions(workspaceId: string): Promise<SyncResult> {
    const result = emptySyncResult(workspaceId, this.provider);

    for await (const stripeSubscription of this.stripe.subscriptions.list(
      {
        status: "all",
        limit: 100,
        expand: ["data.items.data.price"],
      },
      this.accountOpts,
    )) {
      try {
        const providerCustomerId = asStripeId(stripeSubscription.customer);
        if (!providerCustomerId) {
          result.skipped += 1;
          continue;
        }

        const customer = await this.ensureCustomerByProviderId(
          workspaceId,
          providerCustomerId,
        );
        if (!customer) {
          result.skipped += 1;
          continue;
        }

        const input = this.normalizeSubscription(
          workspaceId,
          customer.id,
          stripeSubscription,
        );
        const outcome = await this.upsertSubscription(input);
        result.synced += 1;
        if (outcome.outcome === "created") result.created += 1;
        else result.updated += 1;
      } catch (error) {
        result.errors.push({
          providerObjectId: stripeSubscription.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  async syncInvoices(workspaceId: string): Promise<SyncResult> {
    const result = emptySyncResult(workspaceId, this.provider);

    for await (const stripeInvoice of this.stripe.invoices.list(
      { limit: 100 },
      this.accountOpts,
    )) {
      try {
        if (!stripeInvoice.id) {
          result.skipped += 1;
          continue;
        }

        const providerCustomerId = asStripeId(stripeInvoice.customer);
        if (!providerCustomerId) {
          result.skipped += 1;
          continue;
        }

        const customer = await this.ensureCustomerByProviderId(
          workspaceId,
          providerCustomerId,
        );
        if (!customer) {
          result.skipped += 1;
          continue;
        }

        const localSubscriptionId = await this.resolveLocalSubscriptionId(
          workspaceId,
          getInvoiceSubscriptionId(stripeInvoice),
        );

        const input = this.normalizeInvoice(
          workspaceId,
          customer.id,
          localSubscriptionId,
          stripeInvoice,
        );
        const outcome = await this.upsertInvoice(input);
        result.synced += 1;
        if (outcome.outcome === "created") result.created += 1;
        else if (outcome.outcome === "updated") result.updated += 1;
        else result.skipped += 1;
      } catch (error) {
        result.errors.push({
          providerObjectId: stripeInvoice.id ?? "unknown",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Process a stored Stripe `ProviderEvent` and apply canonical upserts /
   * recovery side effects. Stripe object IDs are the only foreign keys we store.
   */
  async handleEvent(
    workspaceId: string,
    event: ProviderEvent,
  ): Promise<HandleEventResult> {
    const stripeEvent = parseStripeEventPayload(event);
    return this.handleStripeEvent(workspaceId, stripeEvent, event.id);
  }

  /**
   * Switch on Stripe `event.type` and map into RenewFlow records.
   */
  async handleStripeEvent(
    workspaceId: string,
    stripeEvent: Stripe.Event,
    providerEventId?: string,
  ): Promise<HandleEventResult> {
    const base: HandleEventResult = {
      workspaceId,
      provider: this.provider,
      providerEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      handled: false,
    };

    switch (stripeEvent.type) {
      case "customer.created":
      case "customer.updated": {
        const customer = stripeEvent.data.object as Stripe.Customer;
        const upserted = await this.upsertCustomer(
          this.normalizeCustomer(workspaceId, customer),
        );
        return {
          ...base,
          handled: true,
          action: "upserted_customer",
          recordId: upserted.id,
        };
      }

      case "customer.deleted": {
        // Soft-ignore deletes for now; keep historical recovery data intact.
        return { ...base, handled: true, action: "ignored_customer_deleted" };
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const providerCustomerId = asStripeId(subscription.customer);
        if (!providerCustomerId) {
          return { ...base, handled: false, action: "missing_customer" };
        }

        const customer = await this.ensureCustomerByProviderId(
          workspaceId,
          providerCustomerId,
        );
        if (!customer) {
          return { ...base, handled: false, action: "customer_not_found" };
        }

        const upserted = await this.upsertSubscription(
          this.normalizeSubscription(workspaceId, customer.id, subscription),
        );
        return {
          ...base,
          handled: true,
          action: "upserted_subscription",
          recordId: upserted.id,
        };
      }

      case "invoice.created":
      case "invoice.updated":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        const result = await this.handleInvoiceEvent(
          workspaceId,
          stripeEvent.type,
          invoice,
          providerEventId,
        );
        return { ...base, ...result };
      }

      case "account.application.deauthorized": {
        // Connected account revoked RenewFlow's access.
        await prisma.paymentProviderIntegration.updateMany({
          where: {
            workspaceId,
            provider: "STRIPE",
            providerAccountId: this.integration.providerAccountId,
          },
          data: {
            status: "DISABLED",
            metadata: {
              disabledReason: "account.application.deauthorized",
              disabledAt: new Date().toISOString(),
            },
          },
        });
        return {
          ...base,
          handled: true,
          action: "disabled_integration_deauthorized",
        };
      }

      default:
        return { ...base, handled: true, action: "ignored_unhandled_type" };
    }
  }

  // ─── Invoice / recovery handlers ───────────────────────────────────────────

  private async handleInvoiceEvent(
    workspaceId: string,
    eventType: string,
    stripeInvoice: Stripe.Invoice,
    providerEventId?: string,
  ): Promise<Pick<HandleEventResult, "handled" | "action" | "recordId">> {
    const providerCustomerId = asStripeId(stripeInvoice.customer);
    if (!providerCustomerId || !stripeInvoice.id) {
      return { handled: false, action: "missing_invoice_refs" };
    }

    const customer = await this.ensureCustomerByProviderId(
      workspaceId,
      providerCustomerId,
      {
        email: stripeInvoice.customer_email,
        name: stripeInvoice.customer_name,
        currency: stripeInvoice.currency,
      },
    );
    if (!customer) {
      return { handled: false, action: "customer_not_found" };
    }

    const localSubscriptionId = await this.resolveLocalSubscriptionId(
      workspaceId,
      getInvoiceSubscriptionId(stripeInvoice),
    );

    const invoice = await this.upsertInvoice(
      this.normalizeInvoice(
        workspaceId,
        customer.id,
        localSubscriptionId,
        stripeInvoice,
      ),
    );

    if (isStripeInvoiceFullyPaid(stripeInvoice)) {
      await this.markInvoiceRecovered({
        workspaceId,
        invoiceId: invoice.id,
        amountPaid: stripeAmountToDecimal(stripeInvoice.amount_paid ?? 0),
      });
      return {
        handled: true,
        action: "marked_failure_and_recovery_recovered",
        recordId: invoice.id,
      };
    }

    if (eventType === "invoice.payment_failed") {
      const current = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        select: { status: true },
      });
      if (current?.status === "PAID") {
        return {
          handled: true,
          action: "ignored_stale_failure_after_paid",
          recordId: invoice.id,
        };
      }

      const failure = await this.createPaymentFailureAndRecoveryCase({
        workspaceId,
        customerId: customer.id,
        subscriptionId: localSubscriptionId,
        invoiceId: invoice.id,
        providerEventId,
        stripeInvoice,
      });
      return {
        handled: true,
        action: "created_payment_failure_and_recovery_case",
        recordId: failure.recoveryCaseId,
      };
    }

    return {
      handled: true,
      action: "upserted_invoice",
      recordId: invoice.id,
    };
  }

  private async createPaymentFailureAndRecoveryCase(args: {
    workspaceId: string;
    customerId: string;
    subscriptionId: string | null;
    invoiceId: string;
    providerEventId?: string;
    stripeInvoice: Stripe.Invoice;
  }): Promise<{ paymentFailureId: string; recoveryCaseId: string }> {
    const {
      workspaceId,
      customerId,
      subscriptionId,
      invoiceId,
      providerEventId,
      stripeInvoice,
    } = args;

    const existingOpenCase = await prisma.recoveryCase.findFirst({
      where: {
        workspaceId,
        invoiceId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: { openedAt: "desc" },
    });

    if (existingOpenCase?.paymentFailureId) {
      return {
        paymentFailureId: existingOpenCase.paymentFailureId,
        recoveryCaseId: existingOpenCase.id,
      };
    }

    const failureCode =
      stripeInvoice.last_finalization_error?.code ??
      stripeInvoice.last_finalization_error?.type ??
      "payment_failed";
    const failureMessage =
      stripeInvoice.last_finalization_error?.message ??
      "Stripe invoice payment failed";
    const declineCode =
      stripeInvoice.last_finalization_error?.decline_code ?? null;

    const paymentFailure = await prisma.paymentFailure.create({
      data: {
        workspaceId,
        customerId,
        subscriptionId,
        invoiceId,
        providerEventId: providerEventId ?? null,
        status: "OPEN",
        failureCode,
        failureMessage,
        declineCode,
        amount: stripeAmountToDecimal(stripeInvoice.amount_due ?? 0),
        currency: (stripeInvoice.currency ?? "usd").toUpperCase(),
        failedAt: new Date(),
        metadata: {
          stripeInvoiceId: stripeInvoice.id,
          attemptCount: stripeInvoice.attempt_count,
        } satisfies Prisma.InputJsonObject,
      },
    });

    // Hand off to the provider-agnostic recovery engine (initial EMAIL action).
    const { recoveryCase } = await createRecoveryCase(paymentFailure, {
      metadata: {
        source: "stripe.invoice.payment_failed",
        stripeInvoiceId: stripeInvoice.id,
      },
    });

    return {
      paymentFailureId: paymentFailure.id,
      recoveryCaseId: recoveryCase.id,
    };
  }

  private async markInvoiceRecovered(args: {
    workspaceId: string;
    invoiceId: string;
    amountPaid: string;
  }): Promise<void> {
    const { workspaceId, invoiceId, amountPaid } = args;
    const now = new Date();

    const openCases = await prisma.recoveryCase.findMany({
      where: {
        workspaceId,
        invoiceId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: { id: true },
    });

    if (openCases.length > 0) {
      await prisma.recoveryAction.updateMany({
        where: {
          recoveryCaseId: { in: openCases.map((item) => item.id) },
          status: { in: ["PENDING", "SCHEDULED"] },
        },
        data: {
          status: "CANCELED",
          executedAt: now,
          resultSummary: "Canceled: invoice paid",
        },
      });
    }

    await prisma.paymentFailure.updateMany({
      where: {
        workspaceId,
        invoiceId,
        status: "OPEN",
      },
      data: {
        status: "RECOVERED",
        recoveredAt: now,
      },
    });

    await prisma.recoveryCase.updateMany({
      where: {
        workspaceId,
        invoiceId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      data: {
        status: "RECOVERED",
        closedAt: now,
        recoveredAmount: amountPaid,
      },
    });
  }

  // ─── Normalizers ───────────────────────────────────────────────────────────

  normalizeCustomer(
    workspaceId: string,
    stripeCustomer: Stripe.Customer,
  ): CanonicalCustomerInput {
    return {
      workspaceId,
      integrationId: this.integration.id,
      providerCustomerId: stripeCustomer.id,
      email: stripeCustomer.email ?? `${stripeCustomer.id}@unknown.customer`,
      name: stripeCustomer.name,
      currency: (stripeCustomer.currency ?? "usd").toUpperCase(),
      metadata: stripeCustomer.metadata,
    };
  }

  normalizeSubscription(
    workspaceId: string,
    customerId: string,
    stripeSubscription: Stripe.Subscription,
  ): CanonicalSubscriptionInput {
    const primaryItem = stripeSubscription.items.data[0];
    const unitAmount = primaryItem?.price?.unit_amount ?? 0;

    return {
      workspaceId,
      customerId,
      providerSubscriptionId: stripeSubscription.id,
      status: mapStripeSubscriptionStatus(stripeSubscription.status),
      planName:
        primaryItem?.price?.nickname ?? primaryItem?.price?.id ?? "unknown",
      interval: mapStripeBillingInterval(
        primaryItem?.price?.recurring?.interval,
      ),
      amount: stripeAmountToDecimal(unitAmount),
      currency: (primaryItem?.price?.currency ?? "usd").toUpperCase(),
      currentPeriodStart: primaryItem?.current_period_start
        ? unixToDate(primaryItem.current_period_start)
        : new Date(),
      currentPeriodEnd: primaryItem?.current_period_end
        ? unixToDate(primaryItem.current_period_end)
        : new Date(),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: unixToDateOrNull(stripeSubscription.canceled_at),
      trialStart: unixToDateOrNull(stripeSubscription.trial_start),
      trialEnd: unixToDateOrNull(stripeSubscription.trial_end),
      metadata: stripeSubscription.metadata,
    };
  }

  normalizeInvoice(
    workspaceId: string,
    customerId: string,
    subscriptionId: string | null,
    stripeInvoice: Stripe.Invoice,
  ): CanonicalInvoiceInput {
    return {
      workspaceId,
      customerId,
      subscriptionId,
      providerInvoiceId: stripeInvoice.id ?? "",
      status: mapStripeInvoiceStatus(stripeInvoice.status),
      amountDue: stripeAmountToDecimal(stripeInvoice.amount_due ?? 0),
      amountPaid: stripeAmountToDecimal(stripeInvoice.amount_paid ?? 0),
      amountRemaining: stripeAmountToDecimal(
        stripeInvoice.amount_remaining ?? 0,
      ),
      currency: (stripeInvoice.currency ?? "usd").toUpperCase(),
      attemptCount: stripeInvoice.attempt_count ?? 0,
      nextPaymentAttemptAt: unixToDateOrNull(stripeInvoice.next_payment_attempt),
      paidAt: unixToDateOrNull(stripeInvoice.status_transitions?.paid_at),
      dueDate: unixToDateOrNull(stripeInvoice.due_date),
      metadata: stripeInvoice.metadata,
    };
  }

  // ─── Upserts ───────────────────────────────────────────────────────────────

  private async upsertCustomer(
    input: CanonicalCustomerInput,
  ): Promise<{ id: string; outcome: "created" | "updated" }> {
    const existing = await prisma.customer.findUnique({
      where: {
        workspaceId_providerCustomerId: {
          workspaceId: input.workspaceId,
          providerCustomerId: input.providerCustomerId,
        },
      },
      select: { id: true },
    });

    const record = await prisma.customer.upsert({
      where: {
        workspaceId_providerCustomerId: {
          workspaceId: input.workspaceId,
          providerCustomerId: input.providerCustomerId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        providerCustomerId: input.providerCustomerId,
        email: input.email,
        name: input.name,
        currency: input.currency,
        metadata: toJson(input.metadata),
      },
      update: {
        integrationId: input.integrationId,
        email: input.email,
        name: input.name,
        currency: input.currency,
        metadata: toJson(input.metadata),
      },
    });

    return {
      id: record.id,
      outcome: existing ? "updated" : "created",
    };
  }

  private async upsertSubscription(
    input: CanonicalSubscriptionInput,
  ): Promise<{ id: string; outcome: "created" | "updated" }> {
    const existing = await prisma.subscription.findUnique({
      where: {
        workspaceId_providerSubscriptionId: {
          workspaceId: input.workspaceId,
          providerSubscriptionId: input.providerSubscriptionId,
        },
      },
      select: { id: true },
    });

    const record = await prisma.subscription.upsert({
      where: {
        workspaceId_providerSubscriptionId: {
          workspaceId: input.workspaceId,
          providerSubscriptionId: input.providerSubscriptionId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        providerSubscriptionId: input.providerSubscriptionId,
        status: input.status,
        planName: input.planName,
        interval: input.interval,
        amount: input.amount,
        currency: input.currency,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        canceledAt: input.canceledAt,
        trialStart: input.trialStart,
        trialEnd: input.trialEnd,
        metadata: toJson(input.metadata),
      },
      update: {
        customerId: input.customerId,
        status: input.status,
        planName: input.planName,
        interval: input.interval,
        amount: input.amount,
        currency: input.currency,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        canceledAt: input.canceledAt,
        trialStart: input.trialStart,
        trialEnd: input.trialEnd,
        metadata: toJson(input.metadata),
      },
    });

    return {
      id: record.id,
      outcome: existing ? "updated" : "created",
    };
  }

  private async upsertInvoice(
    input: CanonicalInvoiceInput,
  ): Promise<{ id: string; outcome: "created" | "updated" | "unchanged" }> {
    const existing = await prisma.invoice.findUnique({
      where: {
        workspaceId_providerInvoiceId: {
          workspaceId: input.workspaceId,
          providerInvoiceId: input.providerInvoiceId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "PAID" && input.status !== "PAID") {
      return { id: existing.id, outcome: "unchanged" };
    }

    const record = await prisma.invoice.upsert({
      where: {
        workspaceId_providerInvoiceId: {
          workspaceId: input.workspaceId,
          providerInvoiceId: input.providerInvoiceId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        providerInvoiceId: input.providerInvoiceId,
        status: input.status,
        amountDue: input.amountDue,
        amountPaid: input.amountPaid,
        amountRemaining: input.amountRemaining,
        currency: input.currency,
        attemptCount: input.attemptCount,
        nextPaymentAttemptAt: input.nextPaymentAttemptAt,
        paidAt: input.paidAt,
        dueDate: input.dueDate,
        metadata: toJson(input.metadata),
      },
      update: {
        customerId: input.customerId,
        subscriptionId: input.subscriptionId,
        status: input.status,
        amountDue: input.amountDue,
        amountPaid: input.amountPaid,
        amountRemaining: input.amountRemaining,
        currency: input.currency,
        attemptCount: input.attemptCount,
        nextPaymentAttemptAt: input.nextPaymentAttemptAt,
        paidAt: input.paidAt,
        dueDate: input.dueDate,
        metadata: toJson(input.metadata),
      },
    });

    return {
      id: record.id,
      outcome: existing ? "updated" : "created",
    };
  }

  private async ensureCustomerByProviderId(
    workspaceId: string,
    providerCustomerId: string,
    hints?: {
      email?: string | null;
      name?: string | null;
      currency?: string | null;
    },
  ) {
    const existing = await prisma.customer.findUnique({
      where: {
        workspaceId_providerCustomerId: {
          workspaceId,
          providerCustomerId,
        },
      },
    });
    if (existing) {
      return existing;
    }

    try {
      const retrieved = await this.stripe.customers.retrieve(
        providerCustomerId,
        undefined,
        this.accountOpts,
      );
      if (retrieved.deleted) {
        return null;
      }
      await this.upsertCustomer(this.normalizeCustomer(workspaceId, retrieved));
    } catch {
      if (!hints?.email && !hints?.currency) {
        return null;
      }
      await this.upsertCustomer({
        workspaceId,
        integrationId: this.integration.id,
        providerCustomerId,
        email: hints.email ?? `${providerCustomerId}@unknown.customer`,
        name: hints.name,
        currency: (hints.currency ?? "usd").toUpperCase(),
      });
    }

    return prisma.customer.findUnique({
      where: {
        workspaceId_providerCustomerId: {
          workspaceId,
          providerCustomerId,
        },
      },
    });
  }

  private async resolveLocalSubscriptionId(
    workspaceId: string,
    providerSubscriptionId: string | null,
  ): Promise<string | null> {
    if (!providerSubscriptionId) {
      return null;
    }

    const existing = await prisma.subscription.findUnique({
      where: {
        workspaceId_providerSubscriptionId: {
          workspaceId,
          providerSubscriptionId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    try {
      const stripeSubscription = await this.stripe.subscriptions.retrieve(
        providerSubscriptionId,
        { expand: ["items.data.price"] },
        this.accountOpts,
      );
      const providerCustomerId = asStripeId(stripeSubscription.customer);
      if (!providerCustomerId) {
        return null;
      }
      const customer = await this.ensureCustomerByProviderId(
        workspaceId,
        providerCustomerId,
      );
      if (!customer) {
        return null;
      }
      const upserted = await this.upsertSubscription(
        this.normalizeSubscription(
          workspaceId,
          customer.id,
          stripeSubscription,
        ),
      );
      return upserted.id;
    } catch {
      return null;
    }
  }
}

/**
 * Entrypoint used by the webhook worker. Resolves the Stripe service for the
 * workspace and dispatches {@link StripeProviderService.handleStripeEvent}.
 */
export async function handleStripeEvent(
  workspaceId: string,
  event: Stripe.Event | ProviderEvent,
): Promise<HandleEventResult> {
  const stripeEvent = isProviderEvent(event)
    ? parseStripeEventPayload(event)
    : event;
  if (!stripeEvent.account) {
    throw new Error("Stripe event is missing connected account");
  }

  const integrations = await prisma.paymentProviderIntegration.findMany({
    where: {
      workspaceId,
      provider: "STRIPE",
      providerAccountId: stripeEvent.account,
      status: { in: ["ACTIVE", "PENDING"] },
    },
    take: 2,
  });

  if (integrations.length !== 1 || !integrations[0]) {
    throw new Error(
      `No unique Stripe integration for connected account in workspace ${workspaceId}`,
    );
  }

  const { stripe } = await import("@/lib/stripe");
  const service = new StripeProviderService(stripe, integrations[0]);

  if (isProviderEvent(event)) {
    return service.handleEvent(workspaceId, event);
  }

  return service.handleStripeEvent(workspaceId, event, undefined);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isProviderEvent(
  event: Stripe.Event | ProviderEvent,
): event is ProviderEvent {
  return "providerEventId" in event && "payloadJson" in event;
}

function parseStripeEventPayload(event: ProviderEvent): Stripe.Event {
  return event.payloadJson as unknown as Stripe.Event;
}

function emptySyncResult(
  workspaceId: string,
  provider: PaymentProvider,
): SyncResult {
  return {
    workspaceId,
    provider,
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
}

function stripeAmountToDecimal(amountCents: number): string {
  return (amountCents / 100).toFixed(4);
}

function unixToDate(seconds: number): Date {
  return new Date(seconds * 1000);
}

function unixToDateOrNull(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? unixToDate(seconds) : null;
}

function asStripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return asStripeId(invoice.parent?.subscription_details?.subscription);
}

function toJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "PAUSED";
    default:
      return "ACTIVE";
  }
}

function mapStripeBillingInterval(
  interval: Stripe.Price.Recurring.Interval | undefined,
): BillingInterval {
  switch (interval) {
    case "day":
      return "DAY";
    case "week":
      return "WEEK";
    case "month":
      return "MONTH";
    case "year":
      return "YEAR";
    default:
      return "CUSTOM";
  }
}

function mapStripeInvoiceStatus(
  status: Stripe.Invoice.Status | null,
): InvoiceStatus {
  switch (status) {
    case "draft":
      return "DRAFT";
    case "open":
      return "OPEN";
    case "paid":
      return "PAID";
    case "void":
      return "VOID";
    case "uncollectible":
      return "UNCOLLECTIBLE";
    default:
      return "OPEN";
  }
}

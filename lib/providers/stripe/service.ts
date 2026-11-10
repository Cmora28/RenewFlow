import type {
  BillingInterval,
  InvoiceStatus,
  ProviderEvent,
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

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

/**
 * Stripe implementation of {@link PaymentProviderService}.
 *
 * Stripe-specific SDK usage stays in `lib/providers/stripe/*`.
 * Mapping logic is stubbed with comments describing the intended
 * field-level normalization into our canonical models.
 */
export class StripeProviderService implements PaymentProviderService {
  readonly provider = PaymentProvider.Stripe;

  constructor(
    private readonly stripe: Stripe,
    private readonly integration: ProviderIntegrationRef,
  ) {}

  /**
   * List Stripe customers for this account and upsert canonical `Customer` rows.
   *
   * Planned flow:
   * 1. `stripe.customers.list({ limit })` (paginate via `starting_after`)
   * 2. `normalizeCustomer(stripeCustomer)` → {@link CanonicalCustomerInput}
   * 3. Upsert on `(workspaceId, providerCustomerId)`
   */
  async syncCustomers(workspaceId: string): Promise<SyncResult> {
    void this.stripe;
    void this.integration;
    // TODO: implement Stripe customer pagination + Prisma upsert
    return emptySyncResult(workspaceId, this.provider);
  }

  /**
   * List Stripe subscriptions and upsert canonical `Subscription` rows.
   *
   * Planned flow:
   * 1. `stripe.subscriptions.list({ status: 'all', expand: ['data.items.data.price'] })`
   * 2. Resolve local `customerId` from `subscription.customer`
   * 3. `normalizeSubscription(stripeSubscription, customerId)` → {@link CanonicalSubscriptionInput}
   * 4. Upsert on `(workspaceId, providerSubscriptionId)`
   */
  async syncSubscriptions(workspaceId: string): Promise<SyncResult> {
    void this.stripe;
    void this.integration;
    // TODO: implement Stripe subscription pagination + Prisma upsert
    return emptySyncResult(workspaceId, this.provider);
  }

  /**
   * List Stripe invoices and upsert canonical `Invoice` rows.
   *
   * Planned flow:
   * 1. `stripe.invoices.list({ expand: ['data.subscription'] })`
   * 2. Resolve local `customerId` / optional `subscriptionId`
   * 3. `normalizeInvoice(stripeInvoice, customerId, subscriptionId)` → {@link CanonicalInvoiceInput}
   * 4. Upsert on `(workspaceId, providerInvoiceId)`
   */
  async syncInvoices(workspaceId: string): Promise<SyncResult> {
    void this.stripe;
    void this.integration;
    // TODO: implement Stripe invoice pagination + Prisma upsert
    return emptySyncResult(workspaceId, this.provider);
  }

  /**
   * Dispatch a stored Stripe webhook event into the appropriate upsert path.
   *
   * Planned event types:
   * - `customer.*` → normalize + upsert Customer
   * - `customer.subscription.*` → normalize + upsert Subscription
   * - `invoice.*` → normalize + upsert Invoice
   * - `invoice.payment_failed` → also create/update PaymentFailure / RecoveryCase later
   */
  async handleEvent(
    workspaceId: string,
    event: ProviderEvent,
  ): Promise<HandleEventResult> {
    void this.stripe;
    void this.integration;
    // TODO: switch on event.eventType and apply normalize* + upsert
    return {
      workspaceId,
      provider: this.provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      handled: false,
      action: "not_implemented",
    };
  }

  // ─── Normalizers (stubs) ───────────────────────────────────────────────────

  /**
   * Map a Stripe Customer → canonical Customer input.
   *
   * Field mapping:
   * - `providerCustomerId` ← `stripeCustomer.id`
   * - `email`              ← `stripeCustomer.email` (required; skip/flag if missing)
   * - `name`               ← `stripeCustomer.name`
   * - `currency`           ← `stripeCustomer.currency` (fallback workspace/default ISO-4217)
   * - `metadata`           ← `stripeCustomer.metadata`
   * - `integrationId`      ← `this.integration.id`
   * - `workspaceId`        ← method argument / integration.workspaceId
   */
  normalizeCustomer(
    workspaceId: string,
    stripeCustomer: Stripe.Customer,
  ): CanonicalCustomerInput {
    // TODO: implement mapping; amounts/currency should be uppercased ISO codes
    return {
      workspaceId,
      integrationId: this.integration.id,
      providerCustomerId: stripeCustomer.id,
      email: stripeCustomer.email ?? "",
      name: stripeCustomer.name,
      currency: (stripeCustomer.currency ?? "usd").toUpperCase(),
      metadata: stripeCustomer.metadata,
    };
  }

  /**
   * Map a Stripe Subscription → canonical Subscription input.
   *
   * Field mapping:
   * - `providerSubscriptionId` ← `sub.id`
   * - `customerId`             ← resolved local Customer.id (from `sub.customer`)
   * - `status`                 ← map Stripe status → Prisma `SubscriptionStatus`
   *     (active, past_due, unpaid, canceled, incomplete, incomplete_expired,
   *      trialing, paused)
   * - `planName`               ← first item price nickname / product name / price.id
   * - `interval`               ← `items.data[0].price.recurring.interval` → `BillingInterval`
   * - `amount`                 ← unit_amount (cents) / 100 as decimal string
   * - `currency`               ← price.currency (uppercased)
   * - `currentPeriodStart`     ← `current_period_start` (unix → Date)
   * - `currentPeriodEnd`       ← `current_period_end` (unix → Date)
   * - `cancelAtPeriodEnd`      ← `cancel_at_period_end`
   * - `canceledAt`             ← `canceled_at` (unix → Date | null)
   * - `trialStart` / `trialEnd`← trial unix timestamps
   * - `metadata`               ← `sub.metadata`
   */
  normalizeSubscription(
    workspaceId: string,
    customerId: string,
    stripeSubscription: Stripe.Subscription,
  ): CanonicalSubscriptionInput {
    // TODO: read primary subscription item + price; convert cents → major units
    // Note: Stripe API 2024+ exposes period bounds on SubscriptionItem, not Subscription.
    const primaryItem = stripeSubscription.items.data[0];
    const status = mapStripeSubscriptionStatus(stripeSubscription.status);
    const interval = mapStripeBillingInterval(
      primaryItem?.price?.recurring?.interval,
    );
    const periodStart = primaryItem?.current_period_start
      ? new Date(primaryItem.current_period_start * 1000)
      : new Date();
    const periodEnd = primaryItem?.current_period_end
      ? new Date(primaryItem.current_period_end * 1000)
      : new Date();

    return {
      workspaceId,
      customerId,
      providerSubscriptionId: stripeSubscription.id,
      status,
      planName: primaryItem?.price?.nickname ?? primaryItem?.price?.id ?? "unknown",
      interval,
      amount: "0",
      currency: (primaryItem?.price?.currency ?? "usd").toUpperCase(),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000)
        : null,
      trialStart: stripeSubscription.trial_start
        ? new Date(stripeSubscription.trial_start * 1000)
        : null,
      trialEnd: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null,
      metadata: stripeSubscription.metadata,
    };
  }

  /**
   * Map a Stripe Invoice → canonical Invoice input.
   *
   * Field mapping:
   * - `providerInvoiceId`    ← `invoice.id`
   * - `customerId`           ← resolved local Customer.id (from `invoice.customer`)
   * - `subscriptionId`       ← resolved local Subscription.id (from `invoice.subscription`)
   * - `status`               ← map Stripe status → Prisma `InvoiceStatus`
   *     (draft, open, paid, void, uncollectible)
   * - `amountDue`            ← `amount_due` / 100
   * - `amountPaid`           ← `amount_paid` / 100
   * - `amountRemaining`      ← `amount_remaining` / 100
   * - `currency`             ← `currency` (uppercased)
   * - `attemptCount`         ← `attempt_count`
   * - `nextPaymentAttemptAt` ← `next_payment_attempt` (unix → Date | null)
   * - `paidAt`               ← `status_transitions.paid_at` (unix → Date | null)
   * - `dueDate`              ← `due_date` (unix → Date | null)
   * - `metadata`             ← `invoice.metadata`
   */
  normalizeInvoice(
    workspaceId: string,
    customerId: string,
    subscriptionId: string | null,
    stripeInvoice: Stripe.Invoice,
  ): CanonicalInvoiceInput {
    // TODO: convert Stripe minor units → major-unit decimal strings
    return {
      workspaceId,
      customerId,
      subscriptionId,
      providerInvoiceId: stripeInvoice.id ?? "",
      status: mapStripeInvoiceStatus(stripeInvoice.status),
      amountDue: "0",
      amountPaid: "0",
      amountRemaining: "0",
      currency: (stripeInvoice.currency ?? "usd").toUpperCase(),
      attemptCount: stripeInvoice.attempt_count ?? 0,
      nextPaymentAttemptAt: stripeInvoice.next_payment_attempt
        ? new Date(stripeInvoice.next_payment_attempt * 1000)
        : null,
      paidAt: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : null,
      dueDate: stripeInvoice.due_date
        ? new Date(stripeInvoice.due_date * 1000)
        : null,
      metadata: stripeInvoice.metadata,
    };
  }
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

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  // Stripe → Prisma SubscriptionStatus (1:1 for the shared set)
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

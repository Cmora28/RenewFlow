import type {
  BillingInterval,
  InvoiceStatus,
  PaymentProviderIntegration,
  ProviderEvent,
  SubscriptionStatus,
} from "@prisma/client";

/**
 * App-level payment provider identity.
 * Kept separate from Prisma's `PaymentProvider` so we can introduce providers
 * in the abstraction layer before (or without) a schema migration.
 */
export enum PaymentProvider {
  Stripe = "stripe",
  Paddle = "paddle",
  GoCardless = "gocardless",
  Chargebee = "chargebee",
  Recurly = "recurly",
  Braintree = "braintree",
  Adyen = "adyen",
  Custom = "custom",
}

/** Result of a bulk sync against a provider API. */
export interface SyncResult {
  workspaceId: string;
  provider: PaymentProvider;
  synced: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ providerObjectId: string; message: string }>;
}

/** Result of handling a stored provider webhook / event. */
export interface HandleEventResult {
  workspaceId: string;
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  handled: boolean;
  /** Short description of what was done, e.g. "upserted_invoice". */
  action?: string;
  /** Optional local record id touched by this event. */
  recordId?: string;
}

/**
 * Canonical customer shape used when normalizing provider payloads
 * into our workspace-scoped `Customer` model.
 */
export interface CanonicalCustomerInput {
  workspaceId: string;
  integrationId: string;
  providerCustomerId: string;
  email: string;
  name?: string | null;
  currency: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Canonical subscription shape used when normalizing provider payloads
 * into our workspace-scoped `Subscription` model.
 */
export interface CanonicalSubscriptionInput {
  workspaceId: string;
  /** Local Customer.id (resolved from providerCustomerId during sync). */
  customerId: string;
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  planName: string;
  interval: BillingInterval;
  amount: string;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Canonical invoice shape used when normalizing provider payloads
 * into our workspace-scoped `Invoice` model.
 */
export interface CanonicalInvoiceInput {
  workspaceId: string;
  /** Local Customer.id (resolved from providerCustomerId during sync). */
  customerId: string;
  /** Local Subscription.id when the invoice is tied to a subscription. */
  subscriptionId?: string | null;
  providerInvoiceId: string;
  status: InvoiceStatus;
  amountDue: string;
  amountPaid: string;
  amountRemaining: string;
  currency: string;
  attemptCount: number;
  nextPaymentAttemptAt?: Date | null;
  paidAt?: Date | null;
  dueDate?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Provider-agnostic service contract.
 * Each concrete implementation (Stripe, Paddle, …) owns API calls and
 * maps provider objects into our canonical records.
 */
export interface PaymentProviderService {
  readonly provider: PaymentProvider;

  /**
   * Pull customers from the provider and upsert workspace-scoped
   * `Customer` rows keyed by `(workspaceId, providerCustomerId)`.
   */
  syncCustomers(workspaceId: string): Promise<SyncResult>;

  /**
   * Pull subscriptions from the provider and upsert workspace-scoped
   * `Subscription` rows keyed by `(workspaceId, providerSubscriptionId)`.
   */
  syncSubscriptions(workspaceId: string): Promise<SyncResult>;

  /**
   * Pull invoices from the provider and upsert workspace-scoped
   * `Invoice` rows keyed by `(workspaceId, providerInvoiceId)`.
   */
  syncInvoices(workspaceId: string): Promise<SyncResult>;

  /**
   * Process a stored `ProviderEvent` (webhook / event-log entry) and
   * apply the corresponding canonical upserts or side effects.
   */
  handleEvent(
    workspaceId: string,
    event: ProviderEvent,
  ): Promise<HandleEventResult>;
}

/** Dependencies that may be required to construct a provider service. */
export interface ProviderServiceDeps {
  /** Required when resolving a Stripe integration. */
  stripeClient?: import("stripe").default;
}

/** Narrow view of integration fields the registry / services need. */
export type ProviderIntegrationRef = Pick<
  PaymentProviderIntegration,
  "id" | "workspaceId" | "provider" | "providerAccountId" | "status" | "credentials"
>;

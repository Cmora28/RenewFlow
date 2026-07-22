import type { PaymentProvider as PrismaPaymentProvider } from "@prisma/client";
import type Stripe from "stripe";

import { StripeProviderService } from "./stripe/service";
import type {
  PaymentProviderService,
  ProviderIntegrationRef,
  ProviderServiceDeps,
} from "./types";
import { PaymentProvider } from "./types";

/**
 * Map Prisma's `PaymentProvider` enum → app-level {@link PaymentProvider}.
 */
export function toAppPaymentProvider(
  provider: PrismaPaymentProvider,
): PaymentProvider {
  switch (provider) {
    case "STRIPE":
      return PaymentProvider.Stripe;
    case "PADDLE":
      return PaymentProvider.Paddle;
    case "CHARGEBEE":
      return PaymentProvider.Chargebee;
    case "RECURLY":
      return PaymentProvider.Recurly;
    case "BRAINTREE":
      return PaymentProvider.Braintree;
    case "ADYEN":
      return PaymentProvider.Adyen;
    case "CUSTOM":
      return PaymentProvider.Custom;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown Prisma payment provider: ${_exhaustive}`);
    }
  }
}

/**
 * Resolve the concrete {@link PaymentProviderService} for a workspace
 * integration. Extend the switch as new providers are added
 * (Paddle, GoCardless, …).
 *
 * @example
 * ```ts
 * const service = getProviderService(integration, { stripeClient });
 * await service.syncCustomers(integration.workspaceId);
 * ```
 */
export function getProviderService(
  integration: ProviderIntegrationRef,
  deps: ProviderServiceDeps = {},
): PaymentProviderService {
  const provider = toAppPaymentProvider(integration.provider);

  switch (provider) {
    case PaymentProvider.Stripe:
      return createStripeService(integration, deps.stripeClient);

    case PaymentProvider.Paddle:
      // TODO: add Paddle provider service here — see lib/providers/paddle/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/paddle/ and register it here.`,
      );

    case PaymentProvider.GoCardless:
      // TODO: add GoCardless provider service here — see lib/providers/gocardless/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/gocardless/ and register it here.`,
      );

    case PaymentProvider.Chargebee:
      // TODO: implement Chargebee provider service under lib/providers/chargebee/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/${provider}/ and register it here.`,
      );

    case PaymentProvider.Recurly:
      // TODO: implement Recurly provider service under lib/providers/recurly/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/${provider}/ and register it here.`,
      );

    case PaymentProvider.Braintree:
      // TODO: implement Braintree provider service under lib/providers/braintree/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/${provider}/ and register it here.`,
      );

    case PaymentProvider.Adyen:
      // TODO: implement Adyen provider service under lib/providers/adyen/
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/${provider}/ and register it here.`,
      );

    case PaymentProvider.Custom:
      // TODO: implement custom/webhook-only provider adapter if needed
      throw new Error(
        `Provider "${provider}" is not implemented yet. ` +
          `Add a service under lib/providers/${provider}/ and register it here.`,
      );

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported payment provider: ${_exhaustive}`);
    }
  }
}

function createStripeService(
  integration: ProviderIntegrationRef,
  stripeClient: Stripe | undefined,
): StripeProviderService {
  if (!stripeClient) {
    throw new Error(
      "StripeProviderService requires deps.stripeClient. " +
        "Pass an initialized Stripe SDK instance to getProviderService().",
    );
  }

  return new StripeProviderService(stripeClient, integration);
}

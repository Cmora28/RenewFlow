const ALLOWED_HOST = "invoice.stripe.com";

/**
 * Accept only the Stripe-hosted invoice origin over HTTPS.
 * Query parameters on that host are Stripe's own. The app never redirects
 * to a URL supplied by the caller.
 */
export function isAllowedStripeHostedInvoiceUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  if (url.hostname !== ALLOWED_HOST) return false;
  return true;
}

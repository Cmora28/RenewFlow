/**
 * A Stripe invoice is fully paid only when Stripe says so and nothing remains.
 * Event names alone are not a paid signal: `invoice.payment_succeeded` can
 * describe a partial or still-open invoice.
 */
export function isStripeInvoiceFullyPaid(invoice: {
  status?: string | null;
  amount_remaining?: number | null;
}): boolean {
  return invoice.status === "paid" && invoice.amount_remaining === 0;
}

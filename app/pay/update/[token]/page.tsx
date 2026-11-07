import { redirect } from "next/navigation";

import {
  resolvePaymentUpdateLink,
  type PaymentLinkResolution,
} from "@/lib/recovery/payment-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public payment-update link. Query parameters are intentionally unread:
 * account id, workspace id, and return URLs from the request cannot change routing.
 */
export default async function PaymentUpdatePage({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const { token } = await Promise.resolve(params);
  const result = await resolvePaymentUpdateLink(token);
  if (result.outcome === "redirect") {
    redirect(result.url);
  }

  const copy = copyFor(result.outcome);
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-semibold text-slate-900">{copy.title}</h1>
      <p className="mt-3 text-sm text-slate-600">{copy.message}</p>
    </main>
  );
}

function copyFor(outcome: Exclude<PaymentLinkResolution["outcome"], "redirect">): {
  title: string;
  message: string;
} {
  switch (outcome) {
    case "expired":
      return {
        title: "Link expired",
        message: "This payment link has expired. Request a new email from the merchant.",
      };
    case "terminal":
      return {
        title: "Nothing to pay here",
        message: "This recovery is no longer accepting a payment update.",
      };
    case "already_paid":
      return {
        title: "Invoice already paid",
        message: "This invoice is already paid. Opening this link does not change that.",
      };
    default:
      return {
        title: "Link unavailable",
        message: "This payment link cannot be opened.",
      };
  }
}

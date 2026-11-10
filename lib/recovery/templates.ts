import type { Customer, Invoice, MessageTemplate, PaymentFailure } from "@prisma/client";

export type TemplateVars = {
  customerName: string;
  customerEmail: string;
  amount: string;
  currency: string;
  invoiceId: string;
  failureCode: string;
  failureMessage: string;
  paymentUpdateUrl: string;
  workspaceName?: string;
};

const DEFAULT_SUBJECT = "Action needed: update your payment method";

const DEFAULT_BODY = `Hi {{customerName}},

We were unable to collect {{amount}} {{currency}} for your recent invoice.

Reason: {{failureMessage}}

Please update your payment method here:
{{paymentUpdateUrl}}

Thank you`;

/**
 * Very small mustache-style renderer: replaces `{{key}}` tokens.
 * Kept dependency-free for MVP; swap for a real templating engine later.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

export function buildTemplateVars(args: {
  customer: Pick<Customer, "name" | "email">;
  invoice?: Pick<Invoice, "id" | "amountDue" | "currency"> | null;
  paymentFailure: Pick<
    PaymentFailure,
    "amount" | "currency" | "failureCode" | "failureMessage" | "invoiceId"
  >;
  paymentUpdateUrl: string;
  workspaceName?: string;
}): TemplateVars {
  const { customer, invoice, paymentFailure, paymentUpdateUrl, workspaceName } =
    args;

  return {
    customerName: customer.name?.trim() || "there",
    customerEmail: customer.email,
    amount: String(invoice?.amountDue ?? paymentFailure.amount),
    currency: (
      invoice?.currency ??
      paymentFailure.currency ??
      "USD"
    ).toUpperCase(),
    invoiceId: invoice?.id ?? paymentFailure.invoiceId ?? "",
    failureCode: paymentFailure.failureCode ?? "payment_failed",
    failureMessage:
      paymentFailure.failureMessage ?? "We could not process your payment.",
    paymentUpdateUrl,
    workspaceName: workspaceName ?? "RenewFlow",
  };
}

export function renderEmailContent(
  template: Pick<MessageTemplate, "subject" | "body"> | null,
  vars: TemplateVars,
): { subject: string; body: string; html: string } {
  const rawSubject = template?.subject?.trim() || DEFAULT_SUBJECT;
  const rawBody = template?.body?.trim() || DEFAULT_BODY;
  const flatVars: Record<string, string> = {
    customerName: vars.customerName,
    customerEmail: vars.customerEmail,
    amount: vars.amount,
    currency: vars.currency,
    invoiceId: vars.invoiceId,
    failureCode: vars.failureCode,
    failureMessage: vars.failureMessage,
    paymentUpdateUrl: vars.paymentUpdateUrl,
    workspaceName: vars.workspaceName ?? "RenewFlow",
  };

  const subject = renderTemplate(rawSubject, flatVars);
  const body = renderTemplate(rawBody, flatVars);
  const html = body
    .split("\n")
    .map((line) => (line.trim().length === 0 ? "<br/>" : `<p>${escapeHtml(line)}</p>`))
    .join("\n")
    // Allow the payment URL to remain clickable after escaping by re-injecting.
    .replace(
      escapeHtml(vars.paymentUpdateUrl),
      `<a href="${vars.paymentUpdateUrl}">${escapeHtml(vars.paymentUpdateUrl)}</a>`,
    );

  return { subject, body, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Default MessageTemplate name used for first-failure dunning emails. */
export const DEFAULT_DUNNING_TEMPLATE_NAME = "dunning_payment_failed";

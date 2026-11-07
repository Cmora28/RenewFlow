import type { InvoiceStatus, RecoveryCaseStatus } from "@prisma/client";

export function isTerminalRecoveryCase(status: RecoveryCaseStatus): boolean {
  return status === "RECOVERED" || status === "CLOSED" || status === "ABANDONED";
}

export function invoiceBlocksDunning(
  status: InvoiceStatus | null | undefined,
): boolean {
  return status === "PAID";
}

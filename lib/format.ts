import type { PaymentProvider, RecoveryCaseStatus } from "@prisma/client";

export function formatMoney(
  amount: number | string | { toString(): string },
  currency = "USD",
): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) {
    return `${amount} ${currency}`;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** UI filter keys → Prisma RecoveryCaseStatus values */
export const RECOVERY_STATUS_FILTERS = {
  open: ["OPEN"] as RecoveryCaseStatus[],
  pending_customer: ["IN_PROGRESS"] as RecoveryCaseStatus[],
  recovered: ["RECOVERED"] as RecoveryCaseStatus[],
  lost: ["ABANDONED", "CLOSED"] as RecoveryCaseStatus[],
} as const;

export type RecoveryStatusFilter = keyof typeof RECOVERY_STATUS_FILTERS | "all";

export function recoveryStatusLabel(status: RecoveryCaseStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "Pending customer";
    case "RECOVERED":
      return "Recovered";
    case "ABANDONED":
      return "Lost";
    case "CLOSED":
      return "Closed";
    default:
      return status;
  }
}

export function providerLabel(provider: PaymentProvider | null | undefined): string {
  if (!provider) return "—";
  return provider.charAt(0) + provider.slice(1).toLowerCase();
}

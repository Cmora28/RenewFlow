import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import {
  formatDate,
  formatMoney,
  providerLabel,
  recoveryStatusLabel,
  type RecoveryStatusFilter,
} from "@/lib/format";
import type { PaymentProvider, RecoveryCaseStatus } from "@prisma/client";
import { cn } from "@/lib/format";

export type RecoveryCaseRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  amount: string;
  status: RecoveryCaseStatus;
  provider: PaymentProvider | null;
  startedAt: Date;
  closedAt: Date | null;
};

const filters: Array<{ key: RecoveryStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "pending_customer", label: "Pending customer" },
  { key: "recovered", label: "Recovered" },
  { key: "lost", label: "Lost" },
];

export function RecoveryFilters({
  current,
}: {
  current: RecoveryStatusFilter;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const active = current === filter.key;
        const href =
          filter.key === "all" ? "/recovery" : `/recovery?status=${filter.key}`;
        return (
          <Link
            key={filter.key}
            href={href}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition",
              active
                ? "border-accent bg-accent text-white"
                : "border-border bg-white text-foreground hover:bg-accent-soft",
            )}
          >
            {filter.label}
          </Link>
        );
      })}
    </div>
  );
}

export function RecoveryCasesTable({ rows }: { rows: RecoveryCaseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted">
        No recovery cases match this filter.
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Customer</TH>
          <TH>Amount</TH>
          <TH>Status</TH>
          <TH>Provider</TH>
          <TH>Started</TH>
          <TH>Closed</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id} className="cursor-pointer hover:bg-accent-soft/40">
            <TD>
              <Link href={`/recovery/${row.id}`} className="block">
                <span className="font-medium">{row.customerName}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {row.customerEmail}
                </span>
              </Link>
            </TD>
            <TD>
              <Link href={`/recovery/${row.id}`}>{row.amount}</Link>
            </TD>
            <TD>
              <Link href={`/recovery/${row.id}`}>
                <StatusBadge status={row.status} />
              </Link>
            </TD>
            <TD>
              <Link href={`/recovery/${row.id}`}>
                {providerLabel(row.provider)}
              </Link>
            </TD>
            <TD>
              <Link href={`/recovery/${row.id}`}>
                {formatDate(row.startedAt)}
              </Link>
            </TD>
            <TD>
              <Link href={`/recovery/${row.id}`}>
                {formatDate(row.closedAt)}
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function StatusBadge({ status }: { status: RecoveryCaseStatus }) {
  const tone =
    status === "RECOVERED"
      ? "success"
      : status === "OPEN"
        ? "warning"
        : status === "IN_PROGRESS"
          ? "accent"
          : status === "ABANDONED" || status === "CLOSED"
            ? "danger"
            : "neutral";

  return <Badge tone={tone}>{recoveryStatusLabel(status)}</Badge>;
}

export function formatCaseAmount(
  amount: { toString(): string } | number | string,
  currency: string,
): string {
  return formatMoney(amount, currency);
}

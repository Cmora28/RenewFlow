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
    <div className="flex flex-wrap gap-x-1 gap-y-2 border-b border-hairline">
      {filters.map((filter) => {
        const active = current === filter.key;
        const href =
          filter.key === "all" ? "/recovery" : `/recovery?status=${filter.key}`;
        return (
          <Link
            key={filter.key}
            href={href}
            className={cn(
              "relative px-3 pb-3 pt-1 text-sm font-medium transition-colors",
              active
                ? "text-accent"
                : "text-muted hover:text-foreground",
            )}
          >
            {filter.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent transition-all duration-200 ease-out"
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function RecoveryCasesTable({ rows }: { rows: RecoveryCaseRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-16 text-center">
        <p className="font-display text-lg font-semibold text-foreground">
          No cases yet
        </p>
        <p className="mt-1.5 text-sm text-muted">
          Recovery cases will appear here when failed payments are detected.
        </p>
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
        {rows.map((row, index) => (
          <TR
            key={row.id}
            className="animate-row-enter cursor-pointer hover:bg-accent-soft/30"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <TD>
              <Link href={`/recovery/${row.id}`} className="block">
                <span className="font-medium text-foreground hover:text-accent">
                  {row.customerName}
                </span>
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
            <TD className="text-muted">
              <Link href={`/recovery/${row.id}`}>
                {providerLabel(row.provider)}
              </Link>
            </TD>
            <TD className="text-muted">
              <Link href={`/recovery/${row.id}`}>
                {formatDate(row.startedAt)}
              </Link>
            </TD>
            <TD className="text-muted">
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
        ? "accent"
        : status === "IN_PROGRESS"
          ? "warning"
          : status === "ABANDONED" || status === "CLOSED"
            ? "neutral"
            : "neutral";

  return <Badge tone={tone}>{recoveryStatusLabel(status)}</Badge>;
}

export function formatCaseAmount(
  amount: { toString(): string } | number | string,
  currency: string,
): string {
  return formatMoney(amount, currency);
}

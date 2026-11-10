import Link from "next/link";

import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { StatusBadge } from "@/components/recovery/RecoveryTable";
import { getDashboardMetrics } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";
import { getCurrentWorkspace } from "@/lib/workspace";
import type { RecoveryCaseStatus } from "@prisma/client";

function IconArrowDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7l10 10M17 9v8H9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 17L17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPercent() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="16.5" r="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconPie() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a9 9 0 1 0 9 9h-9V3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.5A8.5 8.5 0 0 1 20.5 10H14V3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  const metrics = await getDashboardMetrics(workspace.id);

  return (
    <div>
      <PageHeader title="Dashboard" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Failed MRR"
          value={metrics.failedMrr}
          hint="Open payment failures"
          icon={<IconArrowDown />}
        />
        <StatCard
          label="Recovered MRR"
          value={metrics.recoveredMrr}
          hint="Marked recovered"
          icon={<IconArrowUp />}
        />
        <StatCard
          label="Recovery rate"
          value={metrics.recoveryRate}
          hint="Recovered ÷ (failed + recovered)"
          icon={<IconPercent />}
        />
        <StatCard
          label="Open vs lost"
          value={`${metrics.openCases} / ${metrics.lostCases}`}
          hint="Open or in progress / abandoned or closed"
          icon={<IconPie />}
          valueClassName="[&]:text-foreground"
        />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-hairline bg-card shadow-panel">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            Recent recovery cases
          </h2>
          <Link
            href="/recovery"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            View all cases →
          </Link>
        </div>
        {metrics.recentCases.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No recovery cases yet. Failed invoices will appear here after webhook
            processing.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Started</TH>
              </TR>
            </THead>
            <TBody>
              {metrics.recentCases.map((row, index) => (
                <TR
                  key={row.id}
                  className="hover:bg-accent-soft/30"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <TD>
                    <Link
                      href={`/recovery/${row.id}`}
                      className="flex items-center gap-3 font-medium text-foreground hover:text-accent"
                    >
                      <CustomerAvatar name={row.customer} />
                      {row.customer}
                    </Link>
                  </TD>
                  <TD>{row.amount}</TD>
                  <TD>
                    <StatusBadge status={row.status as RecoveryCaseStatus} />
                  </TD>
                  <TD className="text-muted">{formatDate(row.startedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function CustomerAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">
      {initial}
    </span>
  );
}

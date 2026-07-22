import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
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
import { formatDate, recoveryStatusLabel } from "@/lib/format";
import { getCurrentWorkspace } from "@/lib/workspace";
import type { RecoveryCaseStatus } from "@prisma/client";

export default async function DashboardPage() {
  const workspace = await getCurrentWorkspace();
  const metrics = await getDashboardMetrics(workspace.id);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Recovery performance for the current workspace."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Failed MRR"
          value={metrics.failedMrr}
          hint="Open payment failures"
        />
        <StatCard
          label="Recovered MRR"
          value={metrics.recoveredMrr}
          hint="Marked recovered"
        />
        <StatCard
          label="Recovery rate"
          value={metrics.recoveryRate}
          hint="Recovered ÷ (failed + recovered)"
        />
        <StatCard
          label="Open vs lost"
          value={`${metrics.openCases} / ${metrics.lostCases}`}
          hint="Open or in progress / abandoned or closed"
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Recent recovery cases
            </h2>
            <p className="text-xs text-muted">Latest activity in this workspace</p>
          </div>
          <Link
            href="/recovery"
            className="text-sm font-medium text-accent hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {metrics.recentCases.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">
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
                {metrics.recentCases.map((row) => (
                  <TR key={row.id} className="hover:bg-accent-soft/40">
                    <TD>
                      <Link href={`/recovery/${row.id}`} className="font-medium">
                        {row.customer}
                      </Link>
                    </TD>
                    <TD>{row.amount}</TD>
                    <TD>
                      <StatusBadge status={row.status as RecoveryCaseStatus} />
                    </TD>
                    <TD>{formatDate(row.startedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <Badge>Workspace: {workspace.name}</Badge>
        <Badge tone="accent">
          Tip: open cases use {recoveryStatusLabel("OPEN")} /{" "}
          {recoveryStatusLabel("IN_PROGRESS")}
        </Badge>
      </div>
    </div>
  );
}

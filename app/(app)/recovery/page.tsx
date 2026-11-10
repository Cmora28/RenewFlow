import { PageHeader } from "@/components/ui/PageHeader";
import {
  RecoveryCasesTable,
  RecoveryFilters,
  type RecoveryCaseRow,
} from "@/components/recovery/RecoveryTable";
import { formatMoney, RECOVERY_STATUS_FILTERS, type RecoveryStatusFilter } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

type SearchParams = Promise<{ status?: string }> | { status?: string };

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await Promise.resolve(searchParams);
  const statusParam = params.status;
  const filter: RecoveryStatusFilter =
    statusParam && statusParam in RECOVERY_STATUS_FILTERS
      ? (statusParam as Exclude<RecoveryStatusFilter, "all">)
      : "all";

  const workspace = await getCurrentWorkspace();
  const cases = await prisma.recoveryCase.findMany({
    where: {
      workspaceId: workspace.id,
      ...(filter === "all"
        ? {}
        : { status: { in: [...RECOVERY_STATUS_FILTERS[filter]] } }),
    },
    orderBy: { openedAt: "desc" },
    include: {
      customer: {
        select: {
          name: true,
          email: true,
          integration: { select: { provider: true } },
        },
      },
      invoice: { select: { amountDue: true, currency: true } },
      paymentFailure: { select: { amount: true, currency: true } },
    },
  });

  const rows: RecoveryCaseRow[] = cases.map((item) => ({
    id: item.id,
    customerName: item.customer.name || item.customer.email,
    customerEmail: item.customer.email,
    amount: formatMoney(
      item.invoice?.amountDue ?? item.paymentFailure?.amount ?? 0,
      item.invoice?.currency ?? item.paymentFailure?.currency ?? "USD",
    ),
    status: item.status,
    provider: item.customer.integration?.provider ?? null,
    startedAt: item.openedAt,
    closedAt: item.closedAt,
  }));

  return (
    <div>
      <PageHeader
        title="Recovery"
        description="Monitor and manage subscription recoveries in one inbox."
      />
      <RecoveryFilters current={filter} />
      <div className="mt-6 overflow-hidden rounded-lg border border-hairline bg-card shadow-panel">
        <RecoveryCasesTable rows={rows} />
      </div>
    </div>
  );
}

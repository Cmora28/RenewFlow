import { prisma } from "@/lib/prisma";
import { formatMoney, formatPercent } from "@/lib/format";

export type DashboardMetrics = {
  failedMrr: string;
  recoveredMrr: string;
  recoveryRate: string;
  openCases: number;
  lostCases: number;
  recentCases: Array<{
    id: string;
    customer: string;
    amount: string;
    status: string;
    startedAt: Date;
  }>;
};

export async function getDashboardMetrics(
  workspaceId: string,
): Promise<DashboardMetrics> {
  const [openFailures, recoveredFailures, openCases, lostCases, recentCases] =
    await Promise.all([
      prisma.paymentFailure.findMany({
        where: { workspaceId, status: "OPEN" },
        select: { amount: true, currency: true },
      }),
      prisma.paymentFailure.findMany({
        where: { workspaceId, status: "RECOVERED" },
        select: { amount: true, currency: true },
      }),
      prisma.recoveryCase.count({
        where: { workspaceId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.recoveryCase.count({
        where: { workspaceId, status: { in: ["ABANDONED", "CLOSED"] } },
      }),
      prisma.recoveryCase.findMany({
        where: { workspaceId },
        orderBy: { openedAt: "desc" },
        take: 8,
        include: {
          customer: { select: { name: true, email: true } },
          invoice: { select: { amountDue: true, currency: true } },
          paymentFailure: { select: { amount: true, currency: true } },
        },
      }),
    ]);

  const failedTotal = sumAmounts(openFailures);
  const recoveredTotal = sumAmounts(recoveredFailures);
  const denominator = failedTotal + recoveredTotal;
  const recoveryRate = denominator > 0 ? (recoveredTotal / denominator) * 100 : 0;
  const currency =
    openFailures[0]?.currency ?? recoveredFailures[0]?.currency ?? "USD";

  return {
    failedMrr: formatMoney(failedTotal, currency),
    recoveredMrr: formatMoney(recoveredTotal, currency),
    recoveryRate: formatPercent(recoveryRate),
    openCases,
    lostCases,
    recentCases: recentCases.map((item) => ({
      id: item.id,
      customer: item.customer.name || item.customer.email,
      amount: formatMoney(
        item.invoice?.amountDue ?? item.paymentFailure?.amount ?? 0,
        item.invoice?.currency ?? item.paymentFailure?.currency ?? "USD",
      ),
      status: item.status,
      startedAt: item.openedAt,
    })),
  };
}

function sumAmounts(
  rows: Array<{ amount: { toString(): string } | number | string }>,
): number {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0);
}

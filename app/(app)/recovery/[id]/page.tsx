import Link from "next/link";
import { notFound } from "next/navigation";

import { ResendEmailButton } from "@/components/recovery/ResendEmailButton";
import { StatusBadge } from "@/components/recovery/RecoveryTable";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  formatDateTime,
  formatMoney,
  providerLabel,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function RecoveryCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await Promise.resolve(params);
  const workspace = await getCurrentWorkspace();

  const recoveryCase = await prisma.recoveryCase.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      customer: {
        include: { integration: true },
      },
      invoice: true,
      paymentFailure: true,
      actions: { orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }] },
      messageDeliveries: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!recoveryCase) {
    notFound();
  }

  const amount = formatMoney(
    recoveryCase.invoice?.amountDue ??
      recoveryCase.paymentFailure?.amount ??
      0,
    recoveryCase.invoice?.currency ??
      recoveryCase.paymentFailure?.currency ??
      "USD",
  );

  const timeline = [
    ...recoveryCase.actions.map((action) => ({
      id: `action-${action.id}`,
      at: action.executedAt ?? action.scheduledAt ?? action.createdAt,
      title: `Action · ${action.type}`,
      detail: `${action.status}${action.resultSummary ? ` — ${action.resultSummary}` : ""}`,
      tone: action.status === "SUCCEEDED" ? "success" : action.status === "FAILED" ? "danger" : "neutral",
    })),
    ...recoveryCase.messageDeliveries.map((delivery) => ({
      id: `delivery-${delivery.id}`,
      at: delivery.sentAt ?? delivery.createdAt,
      title: `Message · ${delivery.channel}`,
      detail: `${delivery.status}${delivery.toAddress ? ` → ${delivery.toAddress}` : ""}${delivery.subject ? ` · ${delivery.subject}` : ""}`,
      tone: delivery.status === "SENT" || delivery.status === "DELIVERED" ? "success" : delivery.status === "FAILED" ? "danger" : "neutral",
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div>
      <PageHeader
        title={recoveryCase.customer.name || recoveryCase.customer.email}
        description="Recovery case detail"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={recoveryCase.status} />
            <ResendEmailButton recoveryCaseId={recoveryCase.id} />
          </div>
        }
      >
        <Link href="/recovery" className="text-sm text-accent hover:underline">
          ← Back to recovery
        </Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold">Invoice & failure</h2>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" value={amount} />
            <Field
              label="Provider"
              value={providerLabel(recoveryCase.customer.integration?.provider)}
            />
            <Field
              label="Invoice ID"
              value={recoveryCase.invoice?.providerInvoiceId ?? "—"}
            />
            <Field
              label="Invoice status"
              value={recoveryCase.invoice?.status ?? "—"}
            />
            <Field
              label="Failure code"
              value={recoveryCase.paymentFailure?.failureCode ?? "—"}
            />
            <Field
              label="Decline code"
              value={recoveryCase.paymentFailure?.declineCode ?? "—"}
            />
            <div className="sm:col-span-2">
              <Field
                label="Failure message"
                value={recoveryCase.paymentFailure?.failureMessage ?? "—"}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Case status</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <Field label="Started" value={formatDateTime(recoveryCase.openedAt)} />
            <Field label="Closed" value={formatDateTime(recoveryCase.closedAt)} />
            <Field
              label="Recovered amount"
              value={
                recoveryCase.recoveredAmount
                  ? formatMoney(
                      recoveryCase.recoveredAmount,
                      recoveryCase.invoice?.currency ??
                        recoveryCase.paymentFailure?.currency ??
                        "USD",
                    )
                  : "—"
              }
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="text-xs text-muted">
            Recovery actions and message deliveries
          </p>
        </CardHeader>
        <CardBody>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">No actions yet.</p>
          ) : (
            <ol className="space-y-4">
              {timeline.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="mt-1">
                    <Badge
                      tone={
                        item.tone === "success"
                          ? "success"
                          : item.tone === "danger"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {formatDateTime(item.at)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm text-muted">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

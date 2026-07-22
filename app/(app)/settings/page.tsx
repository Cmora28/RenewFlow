import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  RecoverySequenceForm,
  StripeConnectPanel,
} from "@/components/settings/SettingsForms";
import { prisma } from "@/lib/prisma";
import { isStripeConnectConfigured } from "@/lib/providers/stripe/connect";
import { getCurrentWorkspace, isWorkspaceOwner } from "@/lib/workspace";

type SearchParams =
  | Promise<{ stripe_connected?: string; stripe_error?: string }>
  | { stripe_connected?: string; stripe_error?: string };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await Promise.resolve(searchParams);
  const workspace = await getCurrentWorkspace();
  const canManage = isWorkspaceOwner(workspace.role);

  const stripeIntegration = await prisma.paymentProviderIntegration.findFirst({
    where: {
      workspaceId: workspace.id,
      provider: "STRIPE",
      status: { in: ["ACTIVE", "PENDING", "DISABLED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  const sequence = workspace.parsedSettings.recoverySequence ?? {
    emailCount: 3,
    spanDays: 10,
  };

  const connectedVia =
    stripeIntegration?.metadata &&
    typeof stripeIntegration.metadata === "object" &&
    !Array.isArray(stripeIntegration.metadata)
      ? String(
          (stripeIntegration.metadata as Record<string, unknown>).connectedVia ??
            "",
        )
      : null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connect providers and configure the default recovery sequence."
      />

      {params.stripe_connected ? (
        <p className="mb-4 rounded-md border border-border bg-emerald-50 px-3 py-2 text-sm text-success">
          Stripe connected successfully.
        </p>
      ) : null}
      {params.stripe_error ? (
        <p className="mb-4 rounded-md border border-border bg-red-50 px-3 py-2 text-sm text-danger">
          Stripe connection failed: {params.stripe_error}
        </p>
      ) : null}

      {!canManage ? (
        <p className="mb-4 rounded-md border border-border bg-accent-soft px-3 py-2 text-sm text-muted">
          You have <strong>{workspace.role.toLowerCase()}</strong> access.
          Only workspace owners can change provider integrations or global
          settings.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Stripe connection</h2>
              <p className="text-xs text-muted">
                Prefer Connect OAuth — clients never share secret keys.
              </p>
            </div>
            {stripeIntegration?.status === "ACTIVE" ? (
              <Badge tone="success">ACTIVE</Badge>
            ) : stripeIntegration?.status === "DISABLED" ? (
              <Badge tone="warning">DISABLED</Badge>
            ) : (
              <Badge tone="warning">Not connected</Badge>
            )}
          </CardHeader>
          <CardBody>
            {canManage ? (
              <StripeConnectPanel
                existingAccountId={
                  stripeIntegration?.status === "ACTIVE" ||
                  stripeIntegration?.status === "PENDING"
                    ? stripeIntegration.providerAccountId
                    : null
                }
                status={stripeIntegration?.status}
                connectConfigured={isStripeConnectConfigured()}
                connectedVia={connectedVia}
              />
            ) : (
              <ReadOnlyValue
                label="Stripe account ID"
                value={
                  stripeIntegration?.status === "ACTIVE"
                    ? stripeIntegration.providerAccountId
                    : "Not connected"
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">Default recovery sequence</h2>
            <p className="text-xs text-muted">
              Used when scheduling dunning emails for new failures.
            </p>
          </CardHeader>
          <CardBody>
            {canManage ? (
              <RecoverySequenceForm
                emailCount={sequence.emailCount}
                spanDays={sequence.spanDays}
              />
            ) : (
              <div className="space-y-2 text-sm">
                <ReadOnlyValue
                  label="Emails"
                  value={String(sequence.emailCount)}
                />
                <ReadOnlyValue
                  label="Over days"
                  value={String(sequence.spanDays)}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

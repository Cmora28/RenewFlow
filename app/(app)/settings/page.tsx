import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  RecoverySequenceForm,
  StripeConnectForm,
} from "@/components/settings/SettingsForms";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace, isWorkspaceOwner } from "@/lib/workspace";

export default async function SettingsPage() {
  const workspace = await getCurrentWorkspace();
  const canManage = isWorkspaceOwner(workspace.role);

  const stripeIntegration = await prisma.paymentProviderIntegration.findFirst({
    where: {
      workspaceId: workspace.id,
      provider: "STRIPE",
    },
    orderBy: { updatedAt: "desc" },
  });

  const sequence = workspace.parsedSettings.recoverySequence ?? {
    emailCount: 3,
    spanDays: 10,
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Connect providers and configure the default recovery sequence."
      />

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
                Stores a PaymentProviderIntegration for webhook routing.
              </p>
            </div>
            {stripeIntegration ? (
              <Badge tone="success">{stripeIntegration.status}</Badge>
            ) : (
              <Badge tone="warning">Not connected</Badge>
            )}
          </CardHeader>
          <CardBody>
            {canManage ? (
              <StripeConnectForm
                existingAccountId={stripeIntegration?.providerAccountId}
              />
            ) : (
              <ReadOnlyValue
                label="Stripe account ID"
                value={stripeIntegration?.providerAccountId ?? "Not connected"}
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

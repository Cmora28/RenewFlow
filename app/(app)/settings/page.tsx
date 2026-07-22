import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  RecoverySequenceForm,
  StripeConnectForm,
} from "@/components/settings/SettingsForms";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function SettingsPage() {
  const workspace = await getCurrentWorkspace();
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
            <StripeConnectForm
              existingAccountId={stripeIntegration?.providerAccountId}
            />
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
            <RecoverySequenceForm
              emailCount={sequence.emailCount}
              spanDays={sequence.spanDays}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

import { SignupForm } from "@/components/auth/AuthForms";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function SignupPage() {
  return (
    <Card className="shadow-lift">
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="text-sm text-muted">
          We&apos;ll create your workspace and make you the owner.
        </p>
      </CardHeader>
      <CardBody>
        <SignupForm />
      </CardBody>
    </Card>
  );
}

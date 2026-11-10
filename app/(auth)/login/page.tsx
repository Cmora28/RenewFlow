import { LoginForm } from "@/components/auth/AuthForms";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function LoginPage() {
  return (
    <Card className="shadow-lift">
      <CardHeader>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Log in
        </h1>
        <p className="text-sm text-muted">
          Access your workspace recovery inbox.
        </p>
      </CardHeader>
      <CardBody>
        <LoginForm />
      </CardBody>
    </Card>
  );
}

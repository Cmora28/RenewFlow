import { Card, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/format";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  className?: string;
};

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardBody className="space-y-2">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  );
}

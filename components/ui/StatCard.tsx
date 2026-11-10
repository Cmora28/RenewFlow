import type { ReactNode } from "react";

import { cn } from "@/lib/format";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  className?: string;
  valueClassName?: string;
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
  valueClassName,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-hairline bg-card p-5 shadow-panel",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted">{label}</p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]",
              valueClassName,
            )}
          >
            {value}
          </p>
          {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

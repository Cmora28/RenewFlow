import type { PropsWithChildren } from "react";

import { cn } from "@/lib/format";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-paper text-muted border-hairline",
  success: "bg-emerald-50 text-success border-emerald-200/60",
  warning: "bg-amber-50 text-warning border-amber-200/60",
  danger: "bg-red-50 text-danger border-red-200/60",
  accent: "bg-accent-soft text-accent border-accent-muted/40",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{ tone?: Tone; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium tracking-wide",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

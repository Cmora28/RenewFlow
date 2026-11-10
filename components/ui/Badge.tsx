import type { PropsWithChildren } from "react";

import { cn } from "@/lib/format";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "bg-[#eef1ef] text-[#4a5c54] border-transparent",
  success: "bg-emerald-50 text-success border-transparent",
  warning: "bg-amber-50 text-warning border-transparent",
  danger: "bg-red-50 text-danger border-transparent",
  accent: "bg-[#e0f0eb] text-accent border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{ tone?: Tone; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

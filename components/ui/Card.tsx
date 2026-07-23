import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/format";

type CardVariant = "default" | "flush";

export function Card({
  children,
  className,
  variant = "default",
  ...props
}: PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }
>) {
  return (
    <div
      className={cn(
        "border border-hairline bg-card",
        variant === "default" ? "rounded-lg shadow-panel" : "rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("border-b border-hairline px-5 py-3.5", className)}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

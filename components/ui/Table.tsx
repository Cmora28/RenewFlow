import type { PropsWithChildren, TdHTMLAttributes, ThHTMLAttributes } from "react";

import { cn } from "@/lib/format";

export function Table({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: PropsWithChildren) {
  return <thead className="bg-accent-soft/60 text-muted">{children}</thead>;
}

export function TBody({ children }: PropsWithChildren) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({
  children,
  className,
  href,
}: PropsWithChildren<{ className?: string; href?: string }>) {
  if (href) {
    return (
      <tr className={cn("hover:bg-accent-soft/40", className)}>
        {children}
      </tr>
    );
  }

  return <tr className={className}>{children}</tr>;
}

export function TH({
  children,
  className,
  ...props
}: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-wide",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  ...props
}: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <td className={cn("px-4 py-3 align-middle text-foreground", className)} {...props}>
      {children}
    </td>
  );
}

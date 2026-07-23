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
  return (
    <thead className="border-b border-hairline bg-paper/80 text-muted">
      {children}
    </thead>
  );
}

export function TBody({ children }: PropsWithChildren) {
  return <tbody className="divide-y divide-hairline">{children}</tbody>;
}

export function TR({
  children,
  className,
  href,
  style,
}: PropsWithChildren<{
  className?: string;
  href?: string;
  style?: React.CSSProperties;
}>) {
  if (href) {
    return (
      <tr
        className={cn(
          "transition-colors duration-150 hover:bg-accent-soft/30",
          className,
        )}
        style={style}
      >
        {children}
      </tr>
    );
  }

  return (
    <tr className={cn("transition-colors duration-150", className)} style={style}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  ...props
}: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) {
  return (
    <th
      className={cn(
        "px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider",
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
    <td
      className={cn("px-5 py-3.5 align-middle text-foreground", className)}
      {...props}
    >
      {children}
    </td>
  );
}

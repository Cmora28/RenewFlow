import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>;

const variantClass: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50",
  secondary:
    "bg-white text-foreground border border-border hover:bg-accent-soft disabled:opacity-50",
  ghost: "bg-transparent text-foreground hover:bg-accent-soft disabled:opacity-50",
  danger:
    "bg-danger text-white hover:brightness-110 disabled:opacity-50",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

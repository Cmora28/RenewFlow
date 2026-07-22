"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/format";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/recovery", label: "Recovery" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-white/10 px-4 py-5">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          RenewFlow
        </Link>
        <p className="mt-1 text-xs text-sidebar-muted">Payment recovery</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-white/10 font-medium text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

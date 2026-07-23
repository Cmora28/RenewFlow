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
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-card md:hidden">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-1 flex-col items-center py-2.5 text-xs font-medium transition-colors",
                active ? "text-accent" : "text-muted",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="border-b border-white/8 px-5 py-5">
        <Link
          href="/dashboard"
          className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground"
        >
          RenewFlow
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative rounded-md px-3 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-sidebar-active font-medium text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-accent transition-all duration-200 ease-out"
                />
              ) : null}
              <span className={cn(active && "pl-1")}>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/8 p-4">
        <p className="text-xs leading-relaxed text-sidebar-muted">
          Need help?{" "}
          <a
            href="mailto:support@renewflow.app"
            className="text-sidebar-foreground underline-offset-2 hover:underline"
          >
            Contact support
          </a>
        </p>
      </div>
    </>
  );
}

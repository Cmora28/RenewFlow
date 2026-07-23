"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/format";

const links: Array<{ href: string; label: string; icon: ReactNode }> = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: "/recovery",
    label: "Recovery",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path d="M17 3v4h4M7 21v-4H3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
        <path
          d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 16c2.5-1 4-3.2 4-6.2C11 6.2 8.8 3.5 5.8 3 7.2 7.5 5.5 11.2 3 13.5c2.2.2 3.4 1.2 4 2.5Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M14 20c2.8-1.2 4.5-3.8 4.5-7.2 0-4.2-2.5-7.2-5.8-7.8 1.5 5 0 9-3.2 11.5 2.5.2 3.8 1.4 4.5 3.5Z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-[232px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <SidebarContent pathname={pathname} />
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-card md:hidden">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-accent" : "text-muted",
              )}
            >
              <span className={cn(active ? "text-accent" : "text-muted")}>
                {link.icon}
              </span>
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
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/20 text-accent">
            <BrandMark />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            RenewFlow
          </span>
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
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150",
                active
                  ? "bg-sidebar-active font-medium text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-accent"
                />
              ) : null}
              <span className={cn(active ? "text-accent" : "text-sidebar-muted")}>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/8 p-4">
        <a
          href="mailto:support@renewflow.app"
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs text-sidebar-muted transition hover:bg-white/5 hover:text-sidebar-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <span>
            Need help?
            <span className="mt-0.5 block font-medium text-sidebar-foreground">
              Contact support
            </span>
          </span>
        </a>
      </div>
    </>
  );
}

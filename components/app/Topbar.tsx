"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { WorkspaceSelector } from "@/components/app/WorkspaceSelector";
import type { WorkspaceMembershipOption } from "@/lib/workspace";

type TopbarProps = {
  workspaces: WorkspaceMembershipOption[];
  currentWorkspaceId: string;
  userName: string;
  userEmail: string;
};

export function Topbar({
  workspaces,
  currentWorkspaceId,
  userName,
  userEmail,
}: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline bg-card px-5 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="hidden text-muted sm:inline" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 20V9l8-5 8 5v11H4Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path d="M10 20v-6h4v6" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </span>
        <WorkspaceSelector
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
        />
      </div>
      <ProfileDropdown name={userName} email={userEmail} />
    </header>
  );
}

function ProfileDropdown({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm transition hover:bg-accent-soft/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials || "U"}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight">{name}</span>
        </span>
        <svg
          aria-hidden
          className="hidden h-4 w-4 text-muted sm:block"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1.5 w-52 rounded-md border border-hairline bg-card py-1 shadow-lift">
          <p className="border-b border-hairline px-3 py-2 text-xs text-muted">
            {email}
          </p>
          <Link
            href="/settings"
            className="block px-3 py-2 text-sm transition hover:bg-accent-soft/60"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm transition hover:bg-accent-soft/60"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: "/" });
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

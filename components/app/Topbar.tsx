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
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <WorkspaceSelector
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
      />
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
        className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-accent-soft"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {initials || "U"}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block font-medium leading-tight">{name}</span>
          <span className="block text-xs text-muted">{email}</span>
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-border bg-white p-1 shadow-panel">
          <Link
            href="/settings"
            className="block rounded px-3 py-2 text-sm hover:bg-accent-soft"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent-soft"
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

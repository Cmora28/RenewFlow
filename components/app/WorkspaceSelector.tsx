"use client";

import { useTransition } from "react";

import { switchWorkspace } from "@/lib/actions/auth";
import type { WorkspaceMembershipOption } from "@/lib/workspace";

export function WorkspaceSelector({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: WorkspaceMembershipOption[];
  currentWorkspaceId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (workspaces.length <= 1) {
    const only = workspaces[0];
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">Workspace</p>
        <p className="text-sm font-medium text-foreground">
          {only?.name ?? "Workspace"}
        </p>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted">
        Workspace
      </span>
      <select
        className="mt-0.5 block rounded-md border border-border bg-white px-2 py-1.5 text-sm font-medium outline-none ring-accent focus:ring-2"
        value={currentWorkspaceId}
        disabled={pending}
        onChange={(event) => {
          const workspaceId = event.target.value;
          startTransition(async () => {
            await switchWorkspace(workspaceId);
            window.location.assign("/dashboard");
          });
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}

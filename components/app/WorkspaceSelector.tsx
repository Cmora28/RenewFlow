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
      <p className="text-sm font-medium text-foreground">
        {only?.name ?? "Workspace"}
      </p>
    );
  }

  return (
    <label className="block">
      <select
        className="block rounded-md border border-hairline bg-transparent py-1 pl-0 pr-6 text-sm font-medium text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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

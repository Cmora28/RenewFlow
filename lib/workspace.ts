import type { Workspace, WorkspaceRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const WORKSPACE_COOKIE = "renewflow_workspace_id";

export type AppWorkspace = Workspace & {
  role: WorkspaceRole;
};

export type WorkspaceMembershipOption = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

function withContext(
  workspace: Workspace,
  role: WorkspaceRole,
): AppWorkspace {
  return {
    ...workspace,
    role,
  };
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function listUserWorkspaces(
  userId: string,
): Promise<WorkspaceMembershipOption[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
  }));
}

/**
 * Resolve the active workspace for the signed-in user.
 * Always validates membership and scopes subsequent queries by workspaceId.
 */
export async function getCurrentWorkspace(): Promise<AppWorkspace> {
  const user = await requireUser();
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    throw new Error("User has no workspace memberships");
  }

  const cookieStore = cookies();
  const preferredId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const selected =
    memberships.find((membership) => membership.workspaceId === preferredId) ??
    memberships[0];

  if (!selected) {
    throw new Error("Unable to resolve workspace membership");
  }

  return withContext(selected.workspace, selected.role);
}

export async function requireWorkspaceOwner(): Promise<AppWorkspace> {
  const workspace = await getCurrentWorkspace();
  if (workspace.role !== "OWNER") {
    throw new Error("FORBIDDEN_OWNER_ONLY");
  }
  return workspace;
}

export function isWorkspaceOwner(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

/**
 * Helper for queries: always pass this workspaceId filter.
 */
export async function workspaceScope(): Promise<{ workspaceId: string }> {
  const workspace = await getCurrentWorkspace();
  return { workspaceId: workspace.id };
}

import type { Prisma, Workspace } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type WorkspaceSettings = {
  recoverySequence?: {
    emailCount: number;
    spanDays: number;
  };
};

export type AppWorkspace = Workspace & {
  parsedSettings: WorkspaceSettings;
};

function parseSettings(value: Prisma.JsonValue | null | undefined): WorkspaceSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      recoverySequence: { emailCount: 3, spanDays: 10 },
    };
  }

  const record = value as Record<string, unknown>;
  const sequence = record.recoverySequence as
    | { emailCount?: unknown; spanDays?: unknown }
    | undefined;

  return {
    recoverySequence: {
      emailCount:
        typeof sequence?.emailCount === "number" ? sequence.emailCount : 3,
      spanDays: typeof sequence?.spanDays === "number" ? sequence.spanDays : 10,
    },
  };
}

function withSettings(workspace: Workspace): AppWorkspace {
  return {
    ...workspace,
    parsedSettings: parseSettings(workspace.settings),
  };
}

/**
 * Resolve the current workspace for the authenticated app shell.
 * Auth is not wired yet — uses the first workspace, or creates a demo one.
 */
export async function getCurrentWorkspace(): Promise<AppWorkspace> {
  const existing = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return withSettings(existing);
  }

  try {
    const created = await prisma.workspace.create({
      data: {
        name: "Demo Workspace",
        slug: "demo",
        settings: {
          recoverySequence: { emailCount: 3, spanDays: 10 },
        },
      },
    });
    return withSettings(created);
  } catch {
    const raced = await prisma.workspace.findUnique({ where: { slug: "demo" } });
    if (raced) {
      return withSettings(raced);
    }
    const fallback = await prisma.workspace.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!fallback) {
      throw new Error("Unable to resolve or create a workspace");
    }
    return withSettings(fallback);
  }
}

export async function getCurrentUser() {
  // Placeholder until auth is added.
  return {
    id: "demo-user",
    name: "Demo User",
    email: "demo@renewflow.app",
  };
}

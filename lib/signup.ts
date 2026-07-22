import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueWorkspaceSlug(baseName: string): Promise<string> {
  const base = slugify(baseName) || "workspace";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${Math.random().toString(36).slice(2, 6)}`;
    const slug = `${base}${suffix}`;
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) {
      return slug;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
};

export type SignUpResult =
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; error: string };

/**
 * Create a user, their first workspace, and an OWNER membership.
 */
export async function signUpUser(input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const workspaceName = input.workspaceName.trim() || `${name}'s Workspace`;
  const password = input.password;

  if (!email || !password || password.length < 8) {
    return {
      ok: false,
      error: "Use a valid email and a password with at least 8 characters.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const passwordHash = await hash(password, 12);
  const slug = await uniqueWorkspaceSlug(workspaceName);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug,
        settings: {
          recoverySequence: { emailCount: 3, spanDays: 10 },
        },
      },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    return { userId: user.id, workspaceId: workspace.id };
  });

  return { ok: true, ...result };
}

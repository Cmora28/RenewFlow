import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import {
  signUpSchema,
  zodErrorMessage,
  type SignUpInput,
} from "@/lib/validation";

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

export type { SignUpInput };

export type SignUpResult =
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; error: string };

/**
 * Create a user, their first workspace, and an OWNER membership.
 */
export async function signUpUser(input: SignUpInput): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: zodErrorMessage(parsed.error) };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  const workspaceName =
    parsed.data.workspaceName.trim() || `${name}'s Workspace`;
  const password = parsed.data.password;

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

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { WORKSPACE_COOKIE } from "@/lib/workspace";
import { signUpUser } from "@/lib/signup";

export async function registerAccount(formData: FormData) {
  const name = String(formData.get("name") || "");
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const workspaceName = String(formData.get("workspaceName") || "");

  const result = await signUpUser({ name, email, password, workspaceName });
  if (!result.ok) {
    return result;
  }

  const cookieStore = cookies();
  cookieStore.set(WORKSPACE_COOKIE, result.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return result;
}

export async function switchWorkspace(workspaceId: string) {
  const user = await requireUser();
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    return { ok: false as const, error: "Workspace not found" };
  }

  const cookieStore = cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}

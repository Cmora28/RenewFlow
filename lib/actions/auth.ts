"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { signUpUser } from "@/lib/signup";
import {
  formDataToObject,
  signUpSchema,
  switchWorkspaceSchema,
  zodErrorMessage,
} from "@/lib/validation";
import { requireUser, WORKSPACE_COOKIE } from "@/lib/workspace";

export async function registerAccount(formData: FormData) {
  const parsed = signUpSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false as const, error: zodErrorMessage(parsed.error) };
  }

  const result = await signUpUser(parsed.data);
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
  const parsed = switchWorkspaceSchema.safeParse({ workspaceId });
  if (!parsed.success) {
    return { ok: false as const, error: zodErrorMessage(parsed.error) };
  }

  const user = await requireUser();
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    return { ok: false as const, error: "Workspace not found" };
  }

  const cookieStore = cookies();
  cookieStore.set(WORKSPACE_COOKIE, parsed.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  return { ok: true as const };
}

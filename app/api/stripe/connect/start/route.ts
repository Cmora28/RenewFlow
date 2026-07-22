import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  buildStripeConnectAuthorizeUrl,
  createConnectOAuthState,
  isStripeConnectConfigured,
} from "@/lib/providers/stripe/connect";
import { prisma } from "@/lib/prisma";
import { getCurrentWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start Stripe Connect OAuth for the current workspace (owners only).
 */
export async function GET() {
  try {
    if (!isStripeConnectConfigured()) {
      return NextResponse.redirect(
        new URL(
          "/settings?stripe_error=connect_not_configured",
          process.env.APP_URL || "http://localhost:3000",
        ),
      );
    }

    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(
        new URL("/login", process.env.APP_URL || "http://localhost:3000"),
      );
    }

    const workspace = await getCurrentWorkspace();
    if (workspace.role !== "OWNER") {
      return NextResponse.redirect(
        new URL(
          "/settings?stripe_error=owner_only",
          process.env.APP_URL || "http://localhost:3000",
        ),
      );
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: session.user.id,
        },
      },
    });
    if (!membership || membership.role !== "OWNER") {
      return NextResponse.redirect(
        new URL(
          "/settings?stripe_error=owner_only",
          process.env.APP_URL || "http://localhost:3000",
        ),
      );
    }

    const state = createConnectOAuthState(workspace.id, session.user.id);
    const url = buildStripeConnectAuthorizeUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("[stripe.connect.start]", error);
    return NextResponse.redirect(
      new URL(
        "/settings?stripe_error=start_failed",
        process.env.APP_URL || "http://localhost:3000",
      ),
    );
  }
}

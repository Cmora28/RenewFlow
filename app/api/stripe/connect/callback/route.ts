import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  exchangeStripeConnectCode,
  parseConnectOAuthState,
} from "@/lib/providers/stripe/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appUrl(path: string): URL {
  const base =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return new URL(path, base);
}

/**
 * Stripe Connect OAuth callback.
 * Exchanges `code` for connected account id and upserts PaymentProviderIntegration.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    console.error("[stripe.connect.callback] denied", error, errorDescription);
    return NextResponse.redirect(
      appUrl(
        `/settings?stripe_error=${encodeURIComponent(errorDescription || error)}`,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/settings?stripe_error=missing_code"));
  }

  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(appUrl("/login"));
    }

    const oauthState = parseConnectOAuthState(state);
    if (oauthState.userId !== session.user.id) {
      return NextResponse.redirect(appUrl("/settings?stripe_error=state_user_mismatch"));
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: oauthState.workspaceId,
          userId: session.user.id,
        },
      },
    });
    if (!membership || membership.role !== "OWNER") {
      return NextResponse.redirect(appUrl("/settings?stripe_error=owner_only"));
    }

    const { stripeUserId, credentials } = await exchangeStripeConnectCode(code);

    // Disable any other active Stripe integrations for this workspace (one primary).
    await prisma.paymentProviderIntegration.updateMany({
      where: {
        workspaceId: oauthState.workspaceId,
        provider: "STRIPE",
        NOT: { providerAccountId: stripeUserId },
        status: { in: ["ACTIVE", "PENDING"] },
      },
      data: { status: "DISABLED" },
    });

    await prisma.paymentProviderIntegration.upsert({
      where: {
        workspaceId_provider_providerAccountId: {
          workspaceId: oauthState.workspaceId,
          provider: "STRIPE",
          providerAccountId: stripeUserId,
        },
      },
      create: {
        workspaceId: oauthState.workspaceId,
        provider: "STRIPE",
        providerAccountId: stripeUserId,
        status: "ACTIVE",
        credentials,
        metadata: {
          connectedVia: "stripe_connect_oauth",
          connectedAt: credentials.connectedAt,
          scope: credentials.scope,
          livemode: credentials.livemode,
        },
      },
      update: {
        status: "ACTIVE",
        credentials,
        metadata: {
          connectedVia: "stripe_connect_oauth",
          connectedAt: credentials.connectedAt,
          scope: credentials.scope,
          livemode: credentials.livemode,
        },
      },
    });

    return NextResponse.redirect(appUrl("/settings?stripe_connected=1"));
  } catch (error) {
    console.error("[stripe.connect.callback]", error);
    const message =
      error instanceof Error ? error.message : "connect_failed";
    return NextResponse.redirect(
      appUrl(`/settings?stripe_error=${encodeURIComponent(message)}`),
    );
  }
}

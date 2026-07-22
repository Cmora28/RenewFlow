import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

const STATE_TTL_MS = 1000 * 60 * 15; // 15 minutes

export type ConnectOAuthState = {
  workspaceId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export type StripeConnectCredentials = {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  livemode?: boolean;
  connectedAt: string;
  connectedVia: "stripe_connect_oauth";
};

function getConnectClientId(): string {
  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) {
    throw new Error("STRIPE_CLIENT_ID is not set");
  }
  return clientId;
}

function getAppBaseUrl(): string {
  const base =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export function getStripeConnectRedirectUri(): string {
  return (
    process.env.STRIPE_CONNECT_REDIRECT_URI ||
    `${getAppBaseUrl()}/api/stripe/connect/callback`
  );
}

function getStateSecret(): string {
  const secret =
    process.env.NEXTAUTH_SECRET || process.env.STRIPE_CONNECT_STATE_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to sign Connect OAuth state");
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

/**
 * Build a signed OAuth `state` param binding workspace + user (CSRF protection).
 */
export function createConnectOAuthState(
  workspaceId: string,
  userId: string,
): string {
  const body: ConnectOAuthState = {
    workspaceId,
    userId,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseConnectOAuthState(state: string): ConnectOAuthState {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as ConnectOAuthState;

  if (!parsed.workspaceId || !parsed.userId || !parsed.exp) {
    throw new Error("Invalid OAuth state payload");
  }
  if (Date.now() > parsed.exp) {
    throw new Error("OAuth state expired — try connecting again");
  }

  return parsed;
}

/**
 * Stripe Connect Standard OAuth authorize URL.
 * Client approves access; we never collect their secret key.
 */
export function buildStripeConnectAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getConnectClientId(),
    scope: "read_write",
    redirect_uri: getStripeConnectRedirectUri(),
    state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeStripeConnectCode(code: string): Promise<{
  stripeUserId: string;
  credentials: StripeConnectCredentials;
}> {
  const stripe = getStripe();
  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  const stripeUserId = response.stripe_user_id;
  if (!stripeUserId) {
    throw new Error("Stripe OAuth response missing stripe_user_id");
  }

  return {
    stripeUserId,
    credentials: {
      // TODO: encrypt credentials at rest before production hard launch
      accessToken: response.access_token ?? undefined,
      refreshToken: response.refresh_token ?? undefined,
      tokenType: response.token_type ?? undefined,
      scope: response.scope ?? undefined,
      livemode: response.livemode ?? undefined,
      connectedAt: new Date().toISOString(),
      connectedVia: "stripe_connect_oauth",
    },
  };
}

export async function revokeStripeConnectAccount(
  stripeUserId: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.oauth.deauthorize({
    client_id: getConnectClientId(),
    stripe_user_id: stripeUserId,
  });
}

/** Request options so platform key acts on the connected account. */
export function stripeAccountRequestOptions(
  stripeAccountId: string,
): Stripe.RequestOptions {
  return { stripeAccount: stripeAccountId };
}

export function isStripeConnectConfigured(): boolean {
  return Boolean(process.env.STRIPE_CLIENT_ID && process.env.STRIPE_SECRET_KEY);
}

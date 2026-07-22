"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import {
  connectStripeIntegration,
  disconnectStripeIntegration,
  saveRecoverySequence,
} from "@/lib/actions/settings";

export function StripeConnectPanel({
  existingAccountId,
  status,
  connectConfigured,
  connectedVia,
}: {
  existingAccountId?: string | null;
  status?: string | null;
  connectConfigured: boolean;
  connectedVia?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isActive = status === "ACTIVE" || status === "PENDING";

  return (
    <div className="space-y-4">
      {isActive && existingAccountId ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Connected account
            </p>
            <p className="mt-1 font-mono text-sm text-foreground">
              {existingAccountId}
            </p>
            <p className="mt-1 text-xs text-muted">
              {connectedVia === "stripe_connect_oauth"
                ? "Connected via Stripe Connect OAuth"
                : "Connected via manual account ID"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await disconnectStripeIntegration();
                setMessage(
                  result.ok ? "Stripe disconnected." : result.error,
                );
              });
            }}
          >
            {pending ? "Disconnecting…" : "Disconnect Stripe"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Connect your Stripe account so RenewFlow can receive failed-payment
            webhooks without sharing your secret key.
          </p>
          {connectConfigured ? (
            <Link
              href="/api/stripe/connect/start"
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:brightness-110"
            >
              Connect with Stripe
            </Link>
          ) : (
            <p className="rounded-md border border-border bg-accent-soft px-3 py-2 text-xs text-muted">
              Stripe Connect is not configured on this server yet. Set{" "}
              <code className="font-mono">STRIPE_CLIENT_ID</code> (and platform{" "}
              <code className="font-mono">STRIPE_SECRET_KEY</code>) or use the
              advanced manual account ID option below.
            </p>
          )}
        </div>
      )}

      {message ? <p className="text-xs text-muted">{message}</p> : null}

      <div>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={() => setShowAdvanced((value) => !value)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced: paste account ID"}
        </button>
        {showAdvanced ? (
          <ManualStripeAccountForm existingAccountId={existingAccountId} />
        ) : null}
      </div>
    </div>
  );
}

function ManualStripeAccountForm({
  existingAccountId,
}: {
  existingAccountId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-border bg-white p-3"
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = await connectStripeIntegration(formData);
          setMessage(result.ok ? "Stripe account saved." : result.error);
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Stripe account ID</span>
        <input
          name="providerAccountId"
          defaultValue={existingAccountId ?? ""}
          placeholder="acct_..."
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          required
        />
      </label>
      <p className="text-xs text-muted">
        Manual linking only routes webhooks. Prefer Connect OAuth for API access
        without sharing secret keys.
      </p>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save account ID"}
      </Button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </form>
  );
}

export function RecoverySequenceForm({
  emailCount,
  spanDays,
}: {
  emailCount: number;
  spanDays: number;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = await saveRecoverySequence(formData);
          setMessage(result.ok ? "Recovery sequence saved." : result.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Emails</span>
          <input
            name="emailCount"
            type="number"
            min={1}
            max={10}
            defaultValue={emailCount}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Over days</span>
          <input
            name="spanDays"
            type="number"
            min={1}
            max={60}
            defaultValue={spanDays}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
            required
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Example: 3 emails over 10 days spreads dunning touches across the recovery window.
      </p>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save sequence"}
      </Button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </form>
  );
}

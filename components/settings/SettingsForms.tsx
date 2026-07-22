"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import {
  connectStripeIntegration,
  saveRecoverySequence,
} from "@/lib/actions/settings";

export function StripeConnectForm({
  existingAccountId,
}: {
  existingAccountId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        setMessage(null);
        startTransition(async () => {
          const result = await connectStripeIntegration(formData);
          setMessage(result.ok ? "Stripe connected." : result.error);
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
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : existingAccountId ? "Update connection" : "Connect Stripe"}
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

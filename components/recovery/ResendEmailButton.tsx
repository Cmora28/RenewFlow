"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { resendRecoveryEmail } from "@/lib/actions/recovery";

export function ResendEmailButton({ recoveryCaseId }: { recoveryCaseId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await resendRecoveryEmail(recoveryCaseId);
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            setMessage(result.result.resultSummary);
          });
        }}
      >
        {pending ? "Sending…" : "Resend email"}
      </Button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}

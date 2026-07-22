import type {
  PaymentFailure,
  RecoveryAction,
  RecoveryActionType,
  RecoveryCase,
} from "@prisma/client";

/** Alias used by callers; maps onto Prisma `RecoveryActionType.EMAIL`. */
export type RecoveryActionAlias = "send_email" | "payment_update_link" | RecoveryActionType;

export type CreateRecoveryCaseOptions = {
  /** When the first dunning email should run. Defaults to now. */
  initialEmailAt?: Date;
  /** Extra metadata stored on the RecoveryCase. */
  metadata?: Record<string, unknown>;
  notes?: string;
  /**
   * If true (default), skip creating a new case when an OPEN/IN_PROGRESS
   * case already exists for the same invoice or payment failure.
   */
  reuseExisting?: boolean;
};

export type CreateRecoveryCaseResult = {
  recoveryCase: RecoveryCase;
  initialAction: RecoveryAction | null;
  created: boolean;
};

export type ScheduleActionInput = {
  recoveryCaseId: string;
  /** Prefer `send_email` for MVP dunning; also accepts Prisma enum values. */
  type: RecoveryActionAlias;
  /** Wall-clock time when the action becomes due. Stored as `scheduledAt`. */
  scheduledFor: Date;
  metadata?: Record<string, unknown>;
};

export type ExecuteActionResult = {
  actionId: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  resultSummary: string;
  messageDeliveryId?: string;
  paymentUpdateSessionId?: string;
};

export type RunDueActionsResult = {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ actionId: string; message: string }>;
};

export type PaymentFailureRef = Pick<
  PaymentFailure,
  | "id"
  | "workspaceId"
  | "customerId"
  | "subscriptionId"
  | "invoiceId"
  | "amount"
  | "currency"
  | "failureCode"
  | "failureMessage"
>;

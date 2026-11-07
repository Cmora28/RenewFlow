import type {
  InvoiceStatus,
  Prisma,
  RecoveryAction,
  RecoveryActionType,
  RecoveryCase,
} from "@prisma/client";
import { randomBytes } from "crypto";

import {
  AMBIGUOUS_DELIVERY_SUMMARY,
  MAX_RECOVERY_ACTION_ATTEMPTS,
  PROCESSING_LEASE_MS,
} from "@/lib/jobs/limits";
import { prisma } from "@/lib/prisma";

import { getEmailService } from "./email";
import { invoiceBlocksDunning, isTerminalRecoveryCase } from "./status";
import {
  buildTemplateVars,
  DEFAULT_DUNNING_TEMPLATE_NAME,
  renderEmailContent,
} from "./templates";
import type {
  CreateRecoveryCaseOptions,
  CreateRecoveryCaseResult,
  ExecuteActionResult,
  PaymentFailureRef,
  RecoveryActionAlias,
  ScheduleActionInput,
} from "./types";

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Create a RecoveryCase for a canonical PaymentFailure and schedule the
 * initial dunning email action. Provider-agnostic: operates only on
 * RenewFlow models (no Stripe/Paddle imports).
 *
 * MVP scope is exactly one immediate EMAIL action. Workspace settings are
 * not a multi-email sequence.
 */
export async function createRecoveryCase(
  paymentFailure: PaymentFailureRef,
  options: CreateRecoveryCaseOptions = {},
): Promise<CreateRecoveryCaseResult> {
  const reuseExisting = options.reuseExisting ?? true;

  if (reuseExisting) {
    const existing = await prisma.recoveryCase.findFirst({
      where: {
        workspaceId: paymentFailure.workspaceId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { paymentFailureId: paymentFailure.id },
          ...(paymentFailure.invoiceId
            ? [{ invoiceId: paymentFailure.invoiceId }]
            : []),
        ],
      },
      orderBy: { openedAt: "desc" },
      include: {
        actions: {
          where: { type: "EMAIL" },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (existing) {
      return {
        recoveryCase: existing,
        initialAction: existing.actions[0] ?? null,
        created: false,
      };
    }
  }

  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      workspaceId: paymentFailure.workspaceId,
      customerId: paymentFailure.customerId,
      subscriptionId: paymentFailure.subscriptionId,
      invoiceId: paymentFailure.invoiceId,
      paymentFailureId: paymentFailure.id,
      status: "OPEN",
      openedAt: new Date(),
      notes: options.notes,
      metadata: toJson({
        source: "recovery_engine",
        ...options.metadata,
      }),
    },
  });

  const initialAction = await scheduleAction({
    recoveryCaseId: recoveryCase.id,
    type: "send_email",
    scheduledFor: options.initialEmailAt ?? new Date(),
    metadata: {
      step: "initial_dunning",
      templateName: DEFAULT_DUNNING_TEMPLATE_NAME,
    },
  });

  return {
    recoveryCase,
    initialAction,
    created: true,
  };
}

/**
 * Schedule a RecoveryAction. `scheduledFor` is persisted as `scheduledAt`.
 * Status is `PENDING` when due immediately, otherwise `SCHEDULED`.
 */
export async function scheduleAction(
  input: ScheduleActionInput,
): Promise<RecoveryAction> {
  const type = resolveActionType(input.type);
  const scheduledAt = input.scheduledFor;
  const dueNow = scheduledAt.getTime() <= Date.now() + 1000;

  return prisma.recoveryAction.create({
    data: {
      recoveryCaseId: input.recoveryCaseId,
      type,
      status: dueNow ? "PENDING" : "SCHEDULED",
      scheduledAt,
      metadata: toJson(input.metadata),
    },
  });
}

let beforeProviderSendForTests: (() => Promise<void>) | undefined;

/** Test-only hook that runs after the delivery row is claimed and before send. */
export function setBeforeProviderSendForTests(
  hook: (() => Promise<void>) | undefined,
): void {
  beforeProviderSendForTests = hook;
}

/**
 * Execute a single RecoveryAction.
 *
 * Delivery limits, honestly:
 * - The action claim is compare-and-set. A second worker gets SKIPPED.
 * - A provider call is made only from PENDING or FAILED delivery rows.
 * - If the provider accepts the message and the process dies before
 *   `providerMessageId` is stored, the row stays QUEUED. Later runs do not
 *   call the provider again (`ambiguous_delivery_not_retried`). The same
 *   stop happens if the process dies after QUEUED and before the call, so
 *   a message can be missing rather than duplicated.
 * - The idempotency key `recovery_action_<id>` is passed to the provider.
 *   That is not an exactly-once guarantee in this process.
 * - A case that becomes terminal during the provider request itself can
 *   still be delivered once. Link access and card updates never mark paid.
 */
export async function executeAction(
  actionId: string,
  options: { leaseMs?: number } = {},
): Promise<ExecuteActionResult> {
  const leaseMs = options.leaseMs ?? PROCESSING_LEASE_MS;
  const staleBefore = new Date(Date.now() - leaseMs);
  const claimed = await prisma.recoveryAction.updateMany({
    where: {
      id: actionId,
      OR: [
        {
          status: { in: ["PENDING", "SCHEDULED", "FAILED"] },
          attemptCount: { lt: MAX_RECOVERY_ACTION_ATTEMPTS },
        },
        {
          status: "IN_PROGRESS",
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
      ],
    },
    data: {
      status: "IN_PROGRESS",
      lockedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    return {
      actionId,
      status: "SKIPPED",
      resultSummary: "Action not executable (already claimed or terminal)",
    };
  }

  const action = await prisma.recoveryAction.findUniqueOrThrow({
    where: { id: actionId },
    include: {
      recoveryCase: {
        include: {
          customer: true,
          invoice: true,
          paymentFailure: true,
          workspace: true,
        },
      },
    },
  });

  const recoveryCase = action.recoveryCase;

  if (
    isTerminalRecoveryCase(recoveryCase.status) ||
    invoiceBlocksDunning(recoveryCase.invoice?.status)
  ) {
    const reason = isTerminalRecoveryCase(recoveryCase.status)
      ? `Skipped: recovery case is ${recoveryCase.status}`
      : "Skipped: invoice is paid";
    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: {
        status: "SKIPPED",
        executedAt: new Date(),
        lockedAt: null,
        resultSummary: reason,
      },
    });
    return {
      actionId,
      status: "SKIPPED",
      resultSummary: reason,
    };
  }

  try {
    let result: ExecuteActionResult;

    switch (action.type) {
      case "EMAIL":
      case "PAYMENT_UPDATE_LINK":
      case "DUNNING_STEP":
        result = await executeEmailDunningAction(action.id, recoveryCase);
        break;
      case "SMS":
        // TODO: implement SMS dunning via Twilio (or similar) EmailService-style adapter
        result = {
          actionId,
          status: "SKIPPED",
          resultSummary: `Action type ${action.type} is not implemented yet`,
        };
        await prisma.recoveryAction.update({
          where: { id: actionId },
          data: {
            status: "SKIPPED",
            executedAt: new Date(),
            resultSummary: result.resultSummary,
          },
        });
        return result;
      case "RETRY_PAYMENT":
        // TODO: call provider-agnostic payment retry via PaymentProviderService
        result = {
          actionId,
          status: "SKIPPED",
          resultSummary: `Action type ${action.type} is not implemented yet`,
        };
        await prisma.recoveryAction.update({
          where: { id: actionId },
          data: {
            status: "SKIPPED",
            executedAt: new Date(),
            resultSummary: result.resultSummary,
          },
        });
        return result;
      default:
        result = {
          actionId,
          status: "SKIPPED",
          resultSummary: `Action type ${action.type} is not implemented yet`,
        };
        await prisma.recoveryAction.update({
          where: { id: actionId },
          data: {
            status: "SKIPPED",
            executedAt: new Date(),
            resultSummary: result.resultSummary,
          },
        });
        return result;
    }

    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: {
        status: result.status,
        executedAt: new Date(),
        lockedAt: null,
        resultSummary: result.resultSummary,
        ...(result.status === "FAILED"
          ? { scheduledAt: new Date(Date.now() - 1000) }
          : {}),
      },
    });

    if (result.status === "SUCCEEDED") {
      await prisma.recoveryCase.updateMany({
        where: { id: recoveryCase.id, status: "OPEN" },
        data: { status: "IN_PROGRESS" },
      });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const delivery = await prisma.messageDelivery.findFirst({
      where: { recoveryActionId: actionId },
      orderBy: { createdAt: "desc" },
    });
    if (delivery?.status === "SENT" || delivery?.providerMessageId) {
      const summary = "Recorded delivery; provider was not called again";
      await prisma.recoveryAction.update({
        where: { id: actionId },
        data: {
          status: "SUCCEEDED",
          executedAt: new Date(),
          lockedAt: null,
          resultSummary: summary,
        },
      });
      await prisma.recoveryCase.updateMany({
        where: { id: recoveryCase.id, status: "OPEN" },
        data: { status: "IN_PROGRESS" },
      });
      return {
        actionId,
        status: "SUCCEEDED",
        resultSummary: summary,
        messageDeliveryId: delivery.id,
      };
    }

    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: {
        status: "FAILED",
        executedAt: new Date(),
        lockedAt: null,
        scheduledAt: new Date(Date.now() - 1000),
        resultSummary: message.slice(0, 1000),
      },
    });
    return {
      actionId,
      status: "FAILED",
      resultSummary: message,
    };
  }
}

async function executeEmailDunningAction(
  actionId: string,
  recoveryCase: RecoveryCase & {
    customer: {
      id: string;
      email: string;
      name: string | null;
    };
    invoice: {
      id: string;
      status: InvoiceStatus;
      amountDue: Prisma.Decimal;
      currency: string;
    } | null;
    paymentFailure: PaymentFailureRef | null;
    workspace: { id: string; name: string };
  },
): Promise<ExecuteActionResult> {
  const existingDelivery = await prisma.messageDelivery.findFirst({
    where: { recoveryActionId: actionId, channel: "EMAIL" },
    orderBy: { createdAt: "desc" },
  });

  if (existingDelivery?.status === "SENT" || existingDelivery?.providerMessageId) {
    return {
      actionId,
      status: "SUCCEEDED",
      resultSummary: "Recorded delivery; provider was not called again",
      messageDeliveryId: existingDelivery.id,
    };
  }

  if (existingDelivery?.status === "QUEUED") {
    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: { attemptCount: MAX_RECOVERY_ACTION_ATTEMPTS },
    });
    return {
      actionId,
      status: "FAILED",
      resultSummary: AMBIGUOUS_DELIVERY_SUMMARY,
      messageDeliveryId: existingDelivery.id,
    };
  }

  if (existingDelivery?.status === "CANCELED") {
    return {
      actionId,
      status: "SKIPPED",
      resultSummary: "Skipped: delivery canceled",
      messageDeliveryId: existingDelivery.id,
    };
  }

  const paymentFailure = recoveryCase.paymentFailure;
  if (!paymentFailure) {
    throw new Error("Recovery case is missing paymentFailure");
  }

  const customer = recoveryCase.customer;
  if (!customer.email) {
    throw new Error("Customer has no email address for dunning");
  }

  const session = await createPaymentUpdateSession({
    workspaceId: recoveryCase.workspaceId,
    customerId: recoveryCase.customerId,
    recoveryCaseId: recoveryCase.id,
  });
  const paymentUpdateUrl = buildPaymentUpdateUrl(session.token);
  const content = await renderDunningContent(
    recoveryCase,
    paymentFailure,
    paymentUpdateUrl,
  );
  const template = content.template;

  const delivery = existingDelivery
    ? await prisma.messageDelivery.update({
        where: { id: existingDelivery.id },
        data: {
          status: "PENDING",
          errorMessage: null,
          subject: content.subject,
          body: content.body,
          toAddress: customer.email,
          metadata: {
            paymentUpdateSessionId: session.id,
            paymentUpdateUrl,
          } satisfies Prisma.InputJsonObject,
        },
      })
    : await prisma.messageDelivery.create({
        data: {
          workspaceId: recoveryCase.workspaceId,
          customerId: recoveryCase.customerId,
          recoveryCaseId: recoveryCase.id,
          recoveryActionId: actionId,
          messageTemplateId: template?.id,
          channel: "EMAIL",
          status: "PENDING",
          toAddress: customer.email,
          subject: content.subject,
          body: content.body,
          metadata: {
            paymentUpdateSessionId: session.id,
            paymentUpdateUrl,
          } satisfies Prisma.InputJsonObject,
        },
      });

  const handedOff = await prisma.messageDelivery.updateMany({
    where: { id: delivery.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "QUEUED", errorMessage: null },
  });
  if (handedOff.count === 0) {
    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: { attemptCount: MAX_RECOVERY_ACTION_ATTEMPTS },
    });
    return {
      actionId,
      status: "FAILED",
      resultSummary: AMBIGUOUS_DELIVERY_SUMMARY,
      messageDeliveryId: delivery.id,
    };
  }

  if (beforeProviderSendForTests) {
    await beforeProviderSendForTests();
  }

  const freshCase = await prisma.recoveryCase.findUnique({
    where: { id: recoveryCase.id },
    include: { invoice: { select: { status: true } } },
  });
  if (
    !freshCase ||
    isTerminalRecoveryCase(freshCase.status) ||
    invoiceBlocksDunning(freshCase.invoice?.status)
  ) {
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: "CANCELED", errorMessage: null },
    });
    return {
      actionId,
      status: "SKIPPED",
      resultSummary: "Skipped: recovery resolved before send",
      messageDeliveryId: delivery.id,
    };
  }

  const attempt = await prisma.recoveryAction.findUnique({
    where: { id: actionId },
    select: { attemptCount: true },
  });
  if ((attempt?.attemptCount ?? 0) >= MAX_RECOVERY_ACTION_ATTEMPTS) {
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", errorMessage: "max_attempts_reached" },
    });
    return {
      actionId,
      status: "FAILED",
      resultSummary: "max_attempts_reached",
      messageDeliveryId: delivery.id,
    };
  }

  await prisma.recoveryAction.update({
    where: { id: actionId },
    data: { attemptCount: { increment: 1 } },
  });

  try {
    const emailService = getEmailService();
    const sent = await emailService.send({
      to: customer.email,
      subject: content.subject,
      html: content.html,
      text: content.body,
      idempotencyKey: `recovery_action_${actionId}`,
      tags: {
        recovery_case_id: recoveryCase.id,
        recovery_action_id: actionId,
      },
    });

    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        providerMessageId: sent.providerMessageId,
        sentAt: new Date(),
        metadata: {
          paymentUpdateSessionId: session.id,
          paymentUpdateUrl,
          emailProvider: sent.provider,
        } satisfies Prisma.InputJsonObject,
      },
    });

    await prisma.paymentUpdateSession.update({
      where: { id: session.id },
      data: { status: "OPEN" },
    });

    return {
      actionId,
      status: "SUCCEEDED",
      resultSummary: `Sent dunning email to ${customer.email}`,
      messageDeliveryId: delivery.id,
      paymentUpdateSessionId: session.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 2000),
      },
    });
    throw error;
  }
}

async function renderDunningContent(
  recoveryCase: {
    workspaceId: string;
    customer: { name: string | null; email: string };
    invoice: {
      id: string;
      amountDue: Prisma.Decimal;
      currency: string;
    } | null;
    workspace: { name: string };
  },
  paymentFailure: PaymentFailureRef,
  paymentUpdateUrl: string,
) {
  const template = await prisma.messageTemplate.findFirst({
    where: {
      workspaceId: recoveryCase.workspaceId,
      channel: "EMAIL",
      isActive: true,
      OR: [
        { name: DEFAULT_DUNNING_TEMPLATE_NAME },
        { name: { contains: "dunning" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  const vars = buildTemplateVars({
    customer: recoveryCase.customer,
    invoice: recoveryCase.invoice,
    paymentFailure,
    paymentUpdateUrl,
    workspaceName: recoveryCase.workspace.name,
  });
  return { template, ...renderEmailContent(template, vars) };
}

async function createPaymentUpdateSession(args: {
  workspaceId: string;
  customerId: string;
  recoveryCaseId: string;
}) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS);

  return prisma.paymentUpdateSession.create({
    data: {
      workspaceId: args.workspaceId,
      customerId: args.customerId,
      recoveryCaseId: args.recoveryCaseId,
      token,
      status: "PENDING",
      expiresAt,
      // TODO: when a provider-hosted payment-method update URL exists, set providerUrl
      // from PaymentProviderService instead of (or in addition to) the app-hosted link.
      providerUrl: buildPaymentUpdateUrl(token),
      metadata: {
        createdBy: "recovery_engine",
      } satisfies Prisma.InputJsonObject,
    },
  });
}

export function buildPaymentUpdateUrl(token: string): string {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    .replace(/\/$/, "");
  // TODO: implement public /pay/update/[token] page that collects a new payment method
  return `${base}/pay/update/${token}`;
}

function resolveActionType(type: RecoveryActionAlias): RecoveryActionType {
  switch (type) {
    case "send_email":
      return "EMAIL";
    case "payment_update_link":
      return "PAYMENT_UPDATE_LINK";
    default:
      return type;
  }
}

function toJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

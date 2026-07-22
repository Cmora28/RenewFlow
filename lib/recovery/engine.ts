import type {
  Prisma,
  RecoveryAction,
  RecoveryActionType,
  RecoveryCase,
} from "@prisma/client";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";

import { getEmailService } from "./email";
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

/**
 * Execute a single RecoveryAction. For MVP, `EMAIL` / payment-update link
 * actions generate a PaymentUpdateSession, render a MessageTemplate, send
 * mail via {@link EmailService}, and log a MessageDelivery.
 */
export async function executeAction(
  actionId: string,
): Promise<ExecuteActionResult> {
  const claimed = await prisma.recoveryAction.updateMany({
    where: {
      id: actionId,
      status: { in: ["PENDING", "SCHEDULED"] },
    },
    data: {
      status: "IN_PROGRESS",
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
    recoveryCase.status === "RECOVERED" ||
    recoveryCase.status === "CLOSED" ||
    recoveryCase.status === "ABANDONED"
  ) {
    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: {
        status: "SKIPPED",
        executedAt: new Date(),
        resultSummary: `Skipped: recovery case is ${recoveryCase.status}`,
      },
    });
    return {
      actionId,
      status: "SKIPPED",
      resultSummary: `Skipped: recovery case is ${recoveryCase.status}`,
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
        resultSummary: result.resultSummary,
      },
    });

    if (result.status === "SUCCEEDED" && recoveryCase.status === "OPEN") {
      await prisma.recoveryCase.update({
        where: { id: recoveryCase.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.recoveryAction.update({
      where: { id: actionId },
      data: {
        status: "FAILED",
        executedAt: new Date(),
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
      amountDue: Prisma.Decimal;
      currency: string;
    } | null;
    paymentFailure: PaymentFailureRef | null;
    workspace: { id: string; name: string };
  },
): Promise<ExecuteActionResult> {
  if (!recoveryCase.paymentFailure) {
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
    customer,
    invoice: recoveryCase.invoice,
    paymentFailure: recoveryCase.paymentFailure,
    paymentUpdateUrl,
    workspaceName: recoveryCase.workspace.name,
  });
  const content = renderEmailContent(template, vars);

  const delivery = await prisma.messageDelivery.create({
    data: {
      workspaceId: recoveryCase.workspaceId,
      customerId: recoveryCase.customerId,
      recoveryCaseId: recoveryCase.id,
      recoveryActionId: actionId,
      messageTemplateId: template?.id,
      channel: "EMAIL",
      status: "QUEUED",
      toAddress: customer.email,
      subject: content.subject,
      body: content.body,
      metadata: {
        paymentUpdateSessionId: session.id,
        paymentUpdateUrl,
      } satisfies Prisma.InputJsonObject,
    },
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
      // Hosted update URL is filled once we know APP_URL; providerUrl may be
      // set later by a provider-specific payment-method update flow.
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

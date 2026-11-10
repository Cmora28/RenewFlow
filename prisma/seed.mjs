/**
 * Fictional demo workspace for local UI and screenshots.
 * No provider credentials are stored. Re-running replaces the demo workspace.
 *
 * Login: jordan.hale@example.com / demo-password
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const DEMO_EMAIL = "jordan.hale@example.com";
const DEMO_PASSWORD = "demo-password";
const WORKSPACE_SLUG = "northwind-analytics";
const DEMO_ACCOUNT_ID = "acct_demo_northwind";

function atDay(offsetDays, hours, minutes) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

const ago = (days, hours = 9, minutes = 15) => atDay(-days, hours, minutes);
const ahead = (days, hours = 9, minutes = 0) => atDay(days, hours, minutes);

const CASES = [
  {
    key: "harbor",
    name: "Harbor & Co.",
    email: "billing.harbor@example.com",
    plan: "Analytics Pro",
    amount: "2400.0000",
    caseStatus: "IN_PROGRESS",
    failureStatus: "OPEN",
    invoiceStatus: "OPEN",
    failureCode: "card_declined",
    declineCode: "generic_decline",
    failureMessage: "Your card was declined.",
    openedDaysAgo: 6,
    openedHour: 8,
    openedMinute: 14,
    closedDaysAgo: null,
    recoveredAmount: null,
    emails: [
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "DELIVERED",
        daysAgo: 6,
        hour: 8,
        minute: 16,
        subject: "Action needed: update your payment method",
        summary: "Initial dunning email delivered",
      },
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "OPENED",
        daysAgo: 3,
        hour: 11,
        minute: 42,
        subject: "Reminder: your Harbor & Co. renewal is still unpaid",
        summary: "Reminder opened by the customer",
      },
      {
        actionStatus: "SCHEDULED",
        deliveryStatus: null,
        daysAhead: 1,
        hour: 9,
        minute: 0,
        subject: "Final notice before the subscription pauses",
        summary: "Final notice queued",
      },
    ],
  },
  {
    key: "lumen",
    name: "Lumen Studio",
    email: "ap.lumen@example.com",
    plan: "Design Seats",
    amount: "890.0000",
    caseStatus: "OPEN",
    failureStatus: "OPEN",
    invoiceStatus: "OPEN",
    failureCode: "insufficient_funds",
    declineCode: "insufficient_funds",
    failureMessage: "The card has insufficient funds.",
    openedDaysAgo: 1,
    closedDaysAgo: null,
    recoveredAmount: null,
    emails: [
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "SENT",
        daysAgo: 1,
        subject: "Action needed: update your payment method",
        summary: "Initial dunning email sent",
      },
    ],
  },
  {
    key: "paperkite",
    name: "Paperkite Media",
    email: "finance.paperkite@example.com",
    plan: "Editorial",
    amount: "149.0000",
    caseStatus: "OPEN",
    failureStatus: "OPEN",
    invoiceStatus: "OPEN",
    failureCode: "expired_card",
    declineCode: "expired_card",
    failureMessage: "The card has expired.",
    openedDaysAgo: 3,
    closedDaysAgo: null,
    recoveredAmount: null,
    emails: [
      {
        actionStatus: "FAILED",
        deliveryStatus: "BOUNCED",
        daysAgo: 3,
        subject: "Action needed: update your payment method",
        summary: "Mailbox rejected the first attempt",
      },
    ],
  },
  {
    key: "northline",
    name: "Northline Labs",
    email: "billing.northline@example.com",
    plan: "Platform",
    amount: "4800.0000",
    caseStatus: "RECOVERED",
    failureStatus: "RECOVERED",
    invoiceStatus: "PAID",
    failureCode: "card_declined",
    declineCode: "do_not_honor",
    failureMessage: "The card was declined.",
    openedDaysAgo: 12,
    closedDaysAgo: 2,
    recoveredAmount: "4800.0000",
    emails: [
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "CLICKED",
        daysAgo: 12,
        subject: "Action needed: update your payment method",
        summary: "Customer opened the payment-update link",
      },
    ],
  },
  {
    key: "brightloop",
    name: "Brightloop",
    email: "ops.brightloop@example.com",
    plan: "Growth",
    amount: "1260.0000",
    caseStatus: "IN_PROGRESS",
    failureStatus: "OPEN",
    invoiceStatus: "OPEN",
    failureCode: "authentication_required",
    declineCode: "authentication_required",
    failureMessage: "The bank requested authentication.",
    openedDaysAgo: 4,
    closedDaysAgo: null,
    recoveredAmount: null,
    emails: [
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "DELIVERED",
        daysAgo: 4,
        subject: "Action needed: update your payment method",
        summary: "Initial dunning email delivered",
      },
      {
        actionStatus: "SCHEDULED",
        deliveryStatus: null,
        daysAhead: 2,
        subject: "Reminder: Brightloop renewal still needs a card",
        summary: null,
      },
    ],
  },
  {
    key: "marlowe",
    name: "Marlowe Goods",
    email: "accounts.marlowe@example.com",
    plan: "Starter",
    amount: "640.0000",
    caseStatus: "OPEN",
    failureStatus: "OPEN",
    invoiceStatus: "OPEN",
    failureCode: "processing_error",
    declineCode: null,
    failureMessage: "An error occurred while processing the card.",
    openedDaysAgo: 2,
    closedDaysAgo: null,
    recoveredAmount: null,
    emails: [],
  },
  {
    key: "cedar",
    name: "Cedar & Pine",
    email: "hello.cedar@example.com",
    plan: "Workshop",
    amount: "320.0000",
    caseStatus: "ABANDONED",
    failureStatus: "WRITTEN_OFF",
    invoiceStatus: "UNCOLLECTIBLE",
    failureCode: "card_declined",
    declineCode: "lost_card",
    failureMessage: "The card was reported lost.",
    openedDaysAgo: 28,
    closedDaysAgo: 9,
    recoveredAmount: null,
    emails: [
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "SENT",
        daysAgo: 28,
        subject: "Action needed: update your payment method",
        summary: "Initial dunning email sent",
      },
      {
        actionStatus: "SUCCEEDED",
        deliveryStatus: "SENT",
        daysAgo: 18,
        subject: "Final notice before the subscription pauses",
        summary: "Sequence completed without payment",
      },
    ],
  },
];

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

async function main() {
  const prisma = createClient();
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  try {
    await prisma.workspace.deleteMany({ where: { slug: WORKSPACE_SLUG } });
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        name: "Jordan Hale",
        passwordHash,
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: "Northwind Analytics",
        slug: WORKSPACE_SLUG,
        settings: {
          recoverySequence: { emailCount: 3, spanDays: 10 },
        },
      },
    });

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    const integration = await prisma.paymentProviderIntegration.create({
      data: {
        workspaceId: workspace.id,
        provider: "STRIPE",
        providerAccountId: DEMO_ACCOUNT_ID,
        status: "ACTIVE",
        credentials: null,
        metadata: {
          connectedVia: "stripe_connect_oauth",
          livemode: false,
          demo: true,
        },
      },
    });

    let featuredCaseId = null;

    for (const item of CASES) {
      const customer = await prisma.customer.create({
        data: {
          workspaceId: workspace.id,
          integrationId: integration.id,
          providerCustomerId: `cus_demo_${item.key}`,
          email: item.email,
          name: item.name,
          currency: "USD",
        },
      });

      const periodStart = ago(item.openedDaysAgo + 20);
      const subscription = await prisma.subscription.create({
        data: {
          workspaceId: workspace.id,
          customerId: customer.id,
          providerSubscriptionId: `sub_demo_${item.key}`,
          status: item.caseStatus === "RECOVERED" ? "ACTIVE" : "PAST_DUE",
          planName: item.plan,
          interval: "MONTH",
          amount: item.amount,
          currency: "USD",
          currentPeriodStart: periodStart,
          currentPeriodEnd: ahead(30 - item.openedDaysAgo),
        },
      });

      const paid = item.invoiceStatus === "PAID";
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId: workspace.id,
          customerId: customer.id,
          subscriptionId: subscription.id,
          providerInvoiceId: `in_demo_${item.key}`,
          status: item.invoiceStatus,
          amountDue: item.amount,
          amountPaid: paid ? item.amount : "0",
          amountRemaining: paid ? "0" : item.amount,
          currency: "USD",
          attemptCount: Math.max(item.emails.length, 1),
          dueDate: ago(item.openedDaysAgo),
          paidAt: paid ? ago(item.closedDaysAgo ?? 0) : null,
        },
      });

      const failure = await prisma.paymentFailure.create({
        data: {
          workspaceId: workspace.id,
          customerId: customer.id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          status: item.failureStatus,
          failureCode: item.failureCode,
          failureMessage: item.failureMessage,
          declineCode: item.declineCode,
          amount: item.amount,
          currency: "USD",
          failedAt: ago(
            item.openedDaysAgo,
            item.openedHour ?? 9,
            item.openedMinute ?? 15,
          ),
          recoveredAt:
            item.failureStatus === "RECOVERED"
              ? ago(item.closedDaysAgo ?? 0)
              : null,
        },
      });

      const recoveryCase = await prisma.recoveryCase.create({
        data: {
          workspaceId: workspace.id,
          customerId: customer.id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          paymentFailureId: failure.id,
          status: item.caseStatus,
          openedAt: ago(
            item.openedDaysAgo,
            item.openedHour ?? 9,
            item.openedMinute ?? 15,
          ),
          closedAt:
            item.closedDaysAgo == null
              ? null
              : ago(item.closedDaysAgo, 16, 5),
          recoveredAmount: item.recoveredAmount,
        },
      });

      if (item.key === "harbor") {
        featuredCaseId = recoveryCase.id;
      }

      for (const [index, email] of item.emails.entries()) {
        const at =
          email.daysAhead != null
            ? ahead(email.daysAhead, email.hour ?? 9, email.minute ?? 0)
            : ago(email.daysAgo, email.hour ?? 10, email.minute ?? 5);
        const action = await prisma.recoveryAction.create({
          data: {
            recoveryCaseId: recoveryCase.id,
            type: "EMAIL",
            status: email.actionStatus,
            scheduledAt: at,
            executedAt: email.actionStatus === "SCHEDULED" ? null : at,
            resultSummary: email.summary,
            metadata: { step: index + 1, templateName: "default_dunning" },
          },
        });

        if (!email.deliveryStatus) {
          continue;
        }

        await prisma.messageDelivery.create({
          data: {
            workspaceId: workspace.id,
            customerId: customer.id,
            recoveryCaseId: recoveryCase.id,
            recoveryActionId: action.id,
            channel: "EMAIL",
            status: email.deliveryStatus,
            toAddress: item.email,
            subject: email.subject,
            body: `Hi ${item.name},\n\nWe were unable to collect ${item.amount} USD for your ${item.plan} renewal.\n\nReason: ${item.failureMessage}\n\nPlease update your payment method:\nhttp://localhost:3000/pay/update/demo_${item.key}`,
            sentAt: email.actionStatus === "SCHEDULED" ? null : at,
            deliveredAt:
              email.deliveryStatus === "DELIVERED" ||
              email.deliveryStatus === "OPENED" ||
              email.deliveryStatus === "CLICKED"
                ? at
                : null,
          },
        });
      }
    }

    const summary = {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      workspace: "Northwind Analytics",
      featuredCaseId,
    };
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

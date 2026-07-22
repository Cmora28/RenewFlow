export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional idempotency / correlation key for the email provider. */
  idempotencyKey?: string;
  tags?: Record<string, string>;
};

export type SendEmailResult = {
  providerMessageId: string;
  provider: "resend" | "console";
};

/**
 * Provider-agnostic email port used by the recovery engine.
 * Swap implementations (Resend, SendGrid, SES) without touching recovery logic.
 */
export interface EmailService {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

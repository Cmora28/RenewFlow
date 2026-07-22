import { Resend } from "resend";

import type { EmailService, SendEmailInput, SendEmailResult } from "./types";

/**
 * Resend-backed {@link EmailService}.
 * Requires `RESEND_API_KEY` and optionally `EMAIL_FROM`.
 */
export class ResendEmailService implements EmailService {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM) {
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    this.client = new Resend(apiKey);
    this.from = from || "RenewFlow <onboarding@resend.dev>";
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.idempotencyKey
        ? { "Idempotency-Key": input.idempotencyKey }
        : undefined,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    });

    if (error || !data?.id) {
      throw new Error(error?.message ?? "Resend send failed without message id");
    }

    return {
      providerMessageId: data.id,
      provider: "resend",
    };
  }
}

/**
 * Dev / fallback adapter that logs instead of sending.
 * Used when `RESEND_API_KEY` is unset so local recovery runs still work.
 *
 * TODO: implement Resend email sending here for local/dev when you want real
 * delivery without committing a production key — or remove this fallback and
 * require RESEND_API_KEY in all environments.
 */
export class ConsoleEmailService implements EmailService {
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    // TODO: replace console logging with a real EmailService in production
    const providerMessageId = `console_${Date.now()}`;
    console.info("[email:console] send", {
      to: input.to,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
      providerMessageId,
    });
    return { providerMessageId, provider: "console" };
  }
}

let cachedEmailService: EmailService | undefined;

export function getEmailService(): EmailService {
  if (cachedEmailService) {
    return cachedEmailService;
  }

  cachedEmailService = process.env.RESEND_API_KEY
    ? new ResendEmailService()
    : new ConsoleEmailService();

  return cachedEmailService;
}

export function setEmailServiceForTests(service: EmailService | undefined): void {
  cachedEmailService = service;
}

export { classifyEmailFailure, EmailSendError } from "./errors";
export type { EmailFailureDisposition } from "./errors";
export type { EmailService, SendEmailInput, SendEmailResult } from "./types";
export {
  ConsoleEmailService,
  getEmailService,
  ResendEmailService,
  setEmailServiceForTests,
} from "./resend";

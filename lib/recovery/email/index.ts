export type { EmailService, SendEmailInput, SendEmailResult } from "./types";
export {
  ConsoleEmailService,
  getEmailService,
  ResendEmailService,
  setEmailServiceForTests,
} from "./resend";

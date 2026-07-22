import { z } from "zod";

/** Auth / account registration */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  workspaceName: z.string().trim().min(1, "Workspace name is required").max(120),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const switchWorkspaceSchema = z.object({
  workspaceId: z.string().cuid("Invalid workspace id"),
});

/** Settings */
export const connectStripeSchema = z.object({
  providerAccountId: z
    .string()
    .trim()
    .min(3, "Stripe account id is required")
    .max(255),
});

export type ConnectStripeInput = z.infer<typeof connectStripeSchema>;

export const recoverySequenceSchema = z.object({
  emailCount: z.coerce.number().int().min(1).max(10),
  spanDays: z.coerce.number().int().min(1).max(60),
});

export type RecoverySequenceInput = z.infer<typeof recoverySequenceSchema>;

/** Recovery actions */
export const recoveryCaseIdSchema = z.object({
  recoveryCaseId: z.string().cuid("Invalid recovery case id"),
});

/** Jobs / cron */
export const runJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  secret: z.string().optional(),
});

export type RunJobsQuery = z.infer<typeof runJobsQuerySchema>;

/** Helpers */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      out[key] = value;
    }
  });
  return out;
}

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

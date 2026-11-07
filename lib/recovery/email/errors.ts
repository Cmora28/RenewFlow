const PERMANENT_PROVIDER_CODES = new Set([
  "validation_error",
  "missing_api_key",
  "restricted_api_key",
  "invalid_api_key",
  "not_found",
  "method_not_allowed",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_access",
  "invalid_parameter",
  "invalid_region",
  "missing_required_field",
  "security_error",
  "invalid_idempotency_key",
]);

export type EmailFailureDisposition = "permanent" | "ambiguous";

/**
 * Permanent means the provider rejected the request and a repeat will not
 * become a successful new delivery. Ambiguous means the provider may already
 * have accepted it (timeout, network, 5xx, rate limit, idempotency conflict).
 * Neither disposition is retried automatically.
 */
export class EmailSendError extends Error {
  readonly disposition: EmailFailureDisposition;

  constructor(message: string, disposition: EmailFailureDisposition) {
    super(message);
    this.name = "EmailSendError";
    this.disposition = disposition;
  }
}

export function classifyEmailFailure(input: {
  statusCode?: number | null;
  name?: string | null;
}): EmailFailureDisposition {
  if (input.name && PERMANENT_PROVIDER_CODES.has(input.name)) {
    return "permanent";
  }
  const status = input.statusCode;
  if (status == null) return "ambiguous";
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return "ambiguous";
  }
  if (status >= 400 && status < 500) return "permanent";
  return "ambiguous";
}

// Publishing domain — normalized error taxonomy + retry policy.
// Provider SDKs may throw anything; adapters must map their native errors into
// this taxonomy so the application layer can reason about retries and guidance
// without ever seeing provider internals.
import type { NormalizedProviderError, PublishingErrorCode } from "@nnact/shared";

export const MAX_ATTEMPTS = 4;
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/** Non-retryable codes — do NOT retry these; fail fast and tell the operator. */
const NON_RETRYABLE = new Set<PublishingErrorCode>([
  "AUTH_EXPIRED",
  "PERMISSION_DENIED",
  "INVALID_CONTENT",
  "INVALID_MEDIA",
]);

/**
 * Exponential backoff with full jitter (AWS-style). Capped at MAX_BACKOFF_MS.
 * Called with the zero-based attempt index (0 = first retry after a failure).
 */
export function backoffMs(attempt: number, base = BASE_BACKOFF_MS, ceiling = MAX_BACKOFF_MS): number {
  const exponential = Math.min(ceiling, base * 2 ** attempt);
  return Math.floor(exponential * (0.5 + Math.random() * 0.5));
}

export function isRetryableCode(code: PublishingErrorCode): boolean {
  return !NON_RETRYABLE.has(code);
}

export function normalizeError(code: PublishingErrorCode, message: string, providerRequestId?: string | null): NormalizedProviderError {
  return {
    code,
    message,
    retryable: isRetryableCode(code),
    providerRequestId: providerRequestId ?? null,
  };
}

/** Lightweight HTTP-status → normalized code mapping used by adapters. */
export function errorFromHttpStatus(status: number, message: string, providerRequestId?: string | null): NormalizedProviderError {
  let code: PublishingErrorCode;
  if (status === 401 || status === 403) code = status === 401 ? "AUTH_EXPIRED" : "PERMISSION_DENIED";
  else if (status === 429) code = "RATE_LIMITED";
  else if (status === 400 || status === 422) code = "INVALID_CONTENT";
  else if (status >= 500 && status < 600) code = "PROVIDER_UNAVAILABLE";
  else code = "UNKNOWN_PROVIDER_ERROR";
  return normalizeError(code, message, providerRequestId);
}

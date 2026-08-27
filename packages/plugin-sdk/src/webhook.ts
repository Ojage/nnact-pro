// Canonical webhook wire format — the single source of truth shared by the
// NNACT Pro server (which signs outbound deliveries) and plugin authors
// (who verify them). Stripe-style:
//
//   header value:  t=<unix_ms>,v1=<hex>
//   signed string: `${t}.${rawBody}`
//   v1:            HMAC-SHA256(secret, signedString)
//
// The timestamp is part of the signed material, so a receiver can reject stale
// (replayed) deliveries by bounding the skew — see `verifyWebhook`.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const DEFAULT_TOLERANCE_MS = 5 * 60_000;

/** Mint a per-install webhook signing secret. */
export function generateWebhookSecret(): string {
  return SECRET_PREFIX + randomBytes(24).toString("base64url");
}

/** Produce the `t=,v1=` signature header for a raw body. */
export function signWebhook(secret: string, body: string, timestamp: number = Date.now()): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Verify a `t=,v1=` header against the raw body. Returns true only if the HMAC
 * matches (constant-time) and — when `toleranceMs > 0` — the timestamp is within
 * skew. Pass `toleranceMs: 0` to skip the time check.
 */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
  now: number = Date.now(),
): boolean {
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const ts = Number(parts.t);
  const sig = parts.v1;
  if (!ts || !sig) return false;
  if (toleranceMs > 0 && Math.abs(now - ts) > toleranceMs) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}

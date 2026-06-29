// Plugin portal crypto — pure functions, no DB, fully unit-testable.
// Two primitives:
//   1. Scoped API tokens (INBOUND): plaintext shown once, only the SHA-256 hash
//      is ever stored. Lookups hash the presented token and compare in constant
//      time.
//   2. Webhook signatures (OUTBOUND): HMAC-SHA256 over `${timestamp}.${body}`,
//      Stripe-style, so receivers verify authenticity AND reject replays by
//      bounding the timestamp skew.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "ofp_";
const SECRET_PREFIX = "whsec_";
const DEFAULT_TOLERANCE_MS = 5 * 60_000;

export interface MintedToken {
  token: string; // plaintext — return to the caller once, never persist
  tokenHash: string; // store this
  prefix: string; // store for display, e.g. "ofp_AbC12345"
}

/** Mint a new scoped API token. The plaintext is returned once; persist only the hash. */
export function generateToken(): MintedToken {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, 12) };
}

/** SHA-256 hex of a token. Deterministic; used both at mint and at verify time. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time check that a presented token matches a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  return safeEqualHex(hashToken(token), storedHash);
}

/** Per-install HMAC secret for signing outbound webhooks. */
export function generateWebhookSecret(): string {
  return SECRET_PREFIX + randomBytes(24).toString("base64url");
}

/**
 * Sign a webhook body. Returns a header value `t=<ms>,v1=<hex>`. The signed
 * string is `${timestamp}.${body}` so the timestamp is tamper-evident and can
 * gate replays on the receiver.
 */
export function signWebhook(secret: string, body: string, timestamp: number = Date.now()): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Verify a `t=,v1=` signature header against the body. Checks the HMAC in
 * constant time and, when `toleranceMs > 0`, that the timestamp is within skew
 * (replay defense). Pass `toleranceMs: 0` to skip the time check (e.g. tests).
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
  return safeEqualHex(sig, expected);
}

/** Length-safe, timing-safe comparison of two hex strings. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

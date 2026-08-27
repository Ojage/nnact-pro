// Plugin portal crypto — pure functions, no DB, fully unit-testable.
//
// Scoped API tokens (INBOUND): plaintext shown once, only the SHA-256 hash is
// ever stored. Lookups hash the presented token and compare in constant time.
//
// Webhook signing (OUTBOUND) lives in @nnact/plugin-sdk so the server and plugin
// authors share ONE wire-format implementation — re-exported here for callers.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export { generateWebhookSecret, signWebhook, verifyWebhook } from "@nnact/plugin-sdk";

const TOKEN_PREFIX = "NNP";

export interface MintedToken {
  token: string; // plaintext — return to the caller once, never persist
  tokenHash: string; // store this
  prefix: string; // store for display, e.g. "NNPAbC12345"
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
  const a = hashToken(token);
  if (a.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(storedHash, "hex"));
}

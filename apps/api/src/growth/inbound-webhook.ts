// Inbound mail webhook — HMAC verification and event deduplication.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class InboundWebhookError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Signs a payload with the shared secret.
 *
 * HMAC-SHA256, not sha256(secret ‖ body): concatenating the secret onto the
 * front of the message is a Merkle–Damgård construction and is vulnerable to
 * length extension, which would let an attacker append data to a signed body
 * without knowing the secret.
 */
export function signInboundPayload(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

const HEX_64 = /^[0-9a-f]{64}$/i;

/** Expected header: `X-Growth-Webhook-Signature: sha256=<hex>` */
export function verifyGrowthInboundSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): void {
  if (!secret.trim()) {
    throw new InboundWebhookError("webhook secret not configured", "not_configured", 501);
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    throw new InboundWebhookError("missing or invalid signature header", "bad_signature", 401);
  }
  const presented = signatureHeader.slice("sha256=".length).trim();
  // Reject anything that is not exactly one 64-character hex digest before
  // comparing. Without this, a non-hex string of the right length decodes to a
  // short buffer and timingSafeEqual throws, turning a bad signature into a 500.
  if (!HEX_64.test(presented)) {
    throw new InboundWebhookError("signature mismatch", "bad_signature", 401);
  }
  const expected = signInboundPayload(rawBody, secret);
  // Both sides are validated 64-char hex, so the buffers are equal length and
  // timingSafeEqual cannot throw.
  if (!timingSafeEqual(Buffer.from(presented.toLowerCase(), "hex"), Buffer.from(expected, "hex"))) {
    throw new InboundWebhookError("signature mismatch", "bad_signature", 401);
  }
}

export interface NormalizedInboundEmail {
  provider: string;
  externalId: string;
  fromEmail: string;
  toEmail: string;
  subject?: string;
  bodyText: string;
  providerMessageId?: string;
}

/** Accepts Resend-style or generic JSON inbound payloads. */
export function normalizeInboundPayload(json: unknown): NormalizedInboundEmail {
  if (!json || typeof json !== "object") {
    throw new InboundWebhookError("invalid payload", "invalid_payload");
  }
  const rec = json as Record<string, unknown>;
  const data = (rec.data && typeof rec.data === "object" ? rec.data : rec) as Record<string, unknown>;

  const externalId = String(data.email_id ?? data.message_id ?? data.id ?? rec.id ?? "");
  if (!externalId) throw new InboundWebhookError("missing event id", "missing_event_id");

  const fromRaw = data.from ?? data.sender;
  const fromEmail =
    typeof fromRaw === "string"
      ? fromRaw.replace(/.*<([^>]+)>.*/, "$1").trim()
      : typeof fromRaw === "object" && fromRaw && "email" in fromRaw
        ? String((fromRaw as { email: string }).email)
        : "";
  const toRaw = data.to ?? data.recipient;
  const toEmail = Array.isArray(toRaw)
    ? String(toRaw[0] ?? "")
    : typeof toRaw === "string"
      ? toRaw.replace(/.*<([^>]+)>.*/, "$1").trim()
      : typeof toRaw === "object" && toRaw && "email" in toRaw
        ? String((toRaw as { email: string }).email)
        : String(data.to_email ?? "");

  if (!fromEmail || !toEmail) {
    throw new InboundWebhookError("missing from/to", "missing_addresses");
  }

  const bodyText = String(
    data.text ?? data.body_text ?? data.plain_text ?? data.html ?? rec.text ?? "",
  ).slice(0, 100_000);
  if (!bodyText.trim()) throw new InboundWebhookError("empty body", "empty_body");

  return {
    provider: String(rec.type ?? "generic").includes("email") ? "resend" : "generic",
    externalId,
    fromEmail: fromEmail.toLowerCase(),
    toEmail: toEmail.toLowerCase(),
    subject: data.subject ? String(data.subject) : undefined,
    bodyText,
    providerMessageId: externalId,
  };
}

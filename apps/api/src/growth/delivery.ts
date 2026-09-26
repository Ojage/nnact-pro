// Transport delivery for growth mail.
//
// This is the only place that hands a message to a provider. It resolves the
// transport through the policy layer, so a caller cannot pass an arbitrary
// transport: "resend" and "cold_transport" are the two legal choices, and each
// is restricted to the purposes it is permitted for.
//
// The existing shared SMTP config is used for the Resend transport; the cold
// transport uses its own COLD_SMTP_* settings and is unset by default, so
// cold outreach fails closed with a clear error instead of silently using the
// Resend connection.

import { createTransport } from "nodemailer";
import { resolveSmtpConfig } from "../mailer.js";
import { resolveColdTransportConfig, type TransportId } from "./transport-policy.js";
import type { SenderIdentity } from "./send-policy.js";

export interface SendGrowthEmailInput {
  orgId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  transport: TransportId;
  senderIdentity: SenderIdentity | null;
  replyTo?: string;
}

export type SendGrowthEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

/**
 * Builds the transport config for a growth transport id.
 *
 * Returns null when the transport is not configured — the cold transport is
 * unset by default — so the caller records a FAILED send with the reason
 * instead of falling back to the Resend connection.
 */
function resolveTransportConfig(
  transport: TransportId,
  env: NodeJS.ProcessEnv = process.env,
): { host: string; port: number; secure: boolean; user: string; pass: string } | null {
  if (transport === "cold_transport") {
    return resolveColdTransportConfig(env);
  }
  // "resend" and any future shared transport use the existing SMTP settings.
  return resolveSmtpConfig(env);
}

export async function sendGrowthEmail(input: SendGrowthEmailInput): Promise<SendGrowthEmailResult> {
  if (!input.senderIdentity) {
    return { ok: false, error: "no sender identity" };
  }

  let config: { host: string; port: number; secure: boolean; user: string; pass: string } | null;
  try {
    config = resolveTransportConfig(input.transport);
  } catch (error) {
    // e.g. cold transport not configured. Fail closed with the reason.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!config) {
    return {
      ok: false,
      error:
        input.transport === "cold_transport"
          ? "cold_transport_not_configured: no approved cold-outreach transport is configured"
          : "smtp_not_configured: the shared mail transport is not configured",
    };
  }

  try {
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      requireTLS: !config.secure,
      tls: { rejectUnauthorized: true },
    });

    const info = await transporter.sendMail({
      from: { name: input.senderIdentity.displayName, address: input.senderIdentity.email },
      replyTo: input.replyTo,
      to: input.toEmail,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml ?? undefined,
    });

    return { ok: true, providerMessageId: String(info.messageId) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

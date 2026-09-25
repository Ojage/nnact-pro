// Outbound transport policy for the Growth & Outreach module.
//
// Three message purposes are distinguished, because they are NOT
// interchangeable under provider terms of service:
//
//   * "transactional"        — account/operational mail tied to an existing
//                               relationship or transaction (invoices, job
//                               notifications, password resets).
//   * "permission_marketing" — sent to a person who opted in.
//   * "cold_outreach"        — unsolicited prospecting.
//
// The existing SMTP connection is Resend. Resend's Acceptable Use Policy
// prohibits unsolicited/cold messages, so `cold_outreach` is NOT an allowed
// purpose for that transport. This is enforced here, at the service layer, so a
// direct API call, a queued job, or a hand-rolled script cannot route cold mail
// through Resend. UI hiding is a convenience, not the control.
//
// Cold outreach runs on a separate, independently configured transport that is
// DISABLED until an operator configures a provider whose terms permit it. The
// module therefore fails closed: with no cold transport configured, cold sends
// are refused rather than silently falling back to Resend.

import { resolveSmtpConfig, type SmtpConfig } from "../mailer.js";

export type MessagePurpose = "transactional" | "permission_marketing" | "cold_outreach";

export type TransportId = "resend" | "cold_transport";

/** Purposes each transport is permitted to carry. */
export const TRANSPORT_PERMITTED_PURPOSES: Readonly<Record<TransportId, readonly MessagePurpose[]>> =
  Object.freeze({
    // Resend: transactional + opted-in marketing only. Cold prospecting is
    // excluded by provider AUP.
    resend: Object.freeze(["transactional", "permission_marketing"] as const),
    // The dedicated cold transport is provisioned for cold outreach only, so a
    // misconfigured campaign cannot leak transactional mail onto a bulk-sending
    // reputation.
    cold_transport: Object.freeze(["cold_outreach"] as const),
  });

export class TransportPolicyError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 403) {
    super(message);
    this.name = "TransportPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Throws unless `transport` is allowed to carry `purpose`.
 * This is the choke point every send path must pass through.
 */
export function assertTransportPermitsPurpose(
  transport: TransportId,
  purpose: MessagePurpose,
): void {
  const allowed = TRANSPORT_PERMITTED_PURPOSES[transport];
  if (!allowed) {
    throw new TransportPolicyError(
      "transport_not_registered",
      `transport "${transport}" is not a registered outbound transport`,
    );
  }
  if (!allowed.includes(purpose)) {
    throw new TransportPolicyError(
      "transport_purpose_forbidden",
      `transport "${transport}" may not send "${purpose}" mail; permitted purposes: ${allowed.join(", ")}`,
    );
  }
}

export function transportPermitsPurpose(transport: TransportId, purpose: MessagePurpose): boolean {
  return (TRANSPORT_PERMITTED_PURPOSES[transport] ?? []).includes(purpose);
}

/** Resolves the only transport allowed to carry a given purpose. */
export function transportForPurpose(purpose: MessagePurpose): TransportId {
  // Exactly one transport is registered per purpose by construction. Cold
  // outreach is intentionally NOT resolvable to resend.
  const match = (Object.keys(TRANSPORT_PERMITTED_PURPOSES) as TransportId[]).find((id) =>
    transportPermitsPurpose(id, purpose),
  );
  if (!match) {
    throw new TransportPolicyError(
      "no_transport_for_purpose",
      `no outbound transport is registered for purpose "${purpose}"`,
    );
  }
  return match;
}

export interface ColdTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Reads the separate cold-outreach SMTP configuration. Returns null when the
 * operator has not configured it — cold sending is therefore OFF by default and
 * cannot be enabled by adding a campaign.
 */
export function resolveColdTransportConfig(
  env: NodeJS.ProcessEnv = process.env,
): ColdTransportConfig | null {
  const host = env.COLD_SMTP_HOST?.trim();
  const user = env.COLD_SMTP_USER?.trim();
  const pass = env.COLD_SMTP_PASS;
  if (!host || !user || pass === undefined || pass === "") return null;
  const port = Number(env.COLD_SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: env.COLD_SMTP_SECURE === "true",
    user,
    pass,
    from: env.COLD_SMTP_FROM?.trim() || user,
  };
}

/** True when cold outreach may actually be sent right now. */
export function isColdSendingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveColdTransportConfig(env) !== null;
}

/**
 * Resolves and authorizes the transport for a send, failing closed.
 * Cold outreach is refused unless a dedicated, permitted transport is
 * configured — it never falls back to the Resend connection.
 */
export function resolveAuthorizedTransport(
  purpose: MessagePurpose,
  env: NodeJS.ProcessEnv = process.env,
): { transport: TransportId; config: ColdTransportConfig | SmtpConfig } {
  const transport = transportForPurpose(purpose);
  assertTransportPermitsPurpose(transport, purpose);
  if (transport === "cold_transport") {
    const cold = resolveColdTransportConfig(env);
    if (!cold) {
      throw new TransportPolicyError(
        "cold_transport_not_configured",
        "cold outreach is disabled: no approved cold-outreach transport is configured",
        503,
      );
    }
    return { transport, config: cold };
  }
  // Transactional / permission marketing use the existing SMTP connection.
  const config = resolveSmtpConfig(env);
  if (!config) {
    throw new TransportPolicyError(
      "smtp_not_configured",
      "outbound email is not configured",
      503,
    );
  }
  return { transport, config };
}

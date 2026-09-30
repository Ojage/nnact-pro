// Send-time eligibility rules for the Growth & Outreach module.
//
// Every outbound message must pass through this module immediately before it is
// handed to a transport. It is deliberately pure and synchronous so the rules
// cannot be bypassed by a scheduler, a queued job, or a future send path: a
// caller either satisfies the predicate or receives a refusal.
//
// Three independent gates, all fail-closed:
//   1. Sender identity — only a real, verified, approved identity may send.
//      Identities are backed by an inbox the operator actually controls, so a
//      persona cannot be invented and activated from the UI.
//   2. Suppression — an opt-out or block stops the message at send time, not
//      merely at list-build time, so a queued or retried send cannot slip
//      through after an opt-out landed.
//   3. Follow-up eligibility — a thread stops after a reply, opt-out, bounce,
//      booked meeting, or manual stop.

export type SuppressionScope = "EMAIL" | "DOMAIN" | "PHONE" | "COMPANY";

export type SuppressionReason =
  | "OPT_OUT"
  | "HARD_BOUNCE"
  | "COMPLAINT"
  | "MANUAL_BLOCK"
  | "LEGAL_REQUEST"
  | "PREVIOUS_CUSTOMER_DO_NOT_CONTACT"
  | "OTHER";

export interface SuppressionEntry {
  scope: SuppressionScope;
  value: string;
  reason: SuppressionReason;
  createdAt: Date | string;
}

export type SenderVerificationState = "PENDING" | "VERIFIED" | "FAILED" | "REVOKED";

export interface SenderIdentity {
  id: string;
  /** Display name shown in the From header, e.g. "Dana Reeves". */
  displayName: string;
  /** The real inbox that must receive replies, e.g. "dana@nnact.com". */
  email: string;
  role: string;
  verificationState: SenderVerificationState;
  isActive: boolean;
  /** Operator approval for use on unsolicited (cold) mail. */
  coldApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | string | null;
}

export class SendPolicyError extends Error {
  readonly code: string;
  readonly statusCode: number;
  /** Machine-readable suppression scope, when the refusal came from suppression. */
  readonly scope?: SuppressionScope;

  constructor(code: string, message: string, statusCode = 409, scope?: SuppressionScope) {
    super(message);
    this.name = "SendPolicyError";
    this.code = code;
    this.statusCode = statusCode;
    this.scope = scope;
  }
}

/** Normalizes an email for comparison: trimmed and lowercased. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a domain to its registrable form for suppression matching. Only
 * exact host matches and their subdomains are suppressed, so blocking
 * "example.com" also blocks "mail.example.com" but never "notexample.com".
 */
export function normalizeDomain(value: string | null | undefined): string | null {
  let candidate = value?.trim().toLowerCase() ?? "";
  if (!candidate) return null;
  if (candidate.includes("@")) candidate = candidate.slice(candidate.lastIndexOf("@") + 1);
  candidate = candidate.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return candidate.length > 0 ? candidate : null;
}

export function domainFromEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  return normalizeDomain(normalized.slice(normalized.lastIndexOf("@") + 1));
}

/**
 * Normalizes a phone number to a comparison form.
 *
 * International numbers (written "+27 11 555 0100" or "0027 11 555 0100") are
 * reduced to bare digits. A national number ("011 555 0100") only resolves to
 * the same form when the country calling code is supplied — a trunk-prefix swap
 * is country-specific, so guessing it would merge unrelated numbers. Callers
 * pass the organization's country calling code, which is what makes "+27 …
 * 011…" and "011…" match without hard-coding one country.
 *
 * Note: the shared `normalizePhone` in @nnact/shared/phone is Cameroon-mobile
 * specific (it forces a 237 country code), so it cannot be used for general
 * business contact matching.
 */
export function normalizePhone(
  value: string | null | undefined,
  options: { countryCallingCode?: string | null } = {},
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (!hadPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length > 0 ? digits : null;
  }

  const country = options.countryCallingCode?.replace(/\D/g, "") ?? null;
  const isNational = !hadPlus && digits.startsWith("0");

  if (isNational) {
    if (!country) return digits;
    const national = digits.replace(/^0+/, "");
    const joined = `${country}${national}`;
    return joined.length > 0 ? joined : null;
  }

  return digits;
}

/** Collapses a company name so "Acme (Holdings) Ltd" and "Acme Holdings" match. */
export function normalizeCompany(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return null;
  const collapsed = trimmed
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|bv|plc|pty|sa|ab|as|oy)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.length > 0 ? collapsed : null;
}

export interface SuppressionTarget {
  email?: string | null;
  domain?: string | null;
  phone?: string | null;
  company?: string | null;
  /** Country calling code (e.g. "27") used to expand national phone numbers. */
  countryCallingCode?: string | null;
}

/**
 * Returns the first suppression entry matching the target, or null. EMAIL,
 * PHONE and COMPANY match on normalized equality; DOMAIN matches the exact host
 * or any subdomain of it.
 */
export function findSuppressionMatch(
  suppressions: readonly SuppressionEntry[],
  target: SuppressionTarget,
): SuppressionEntry | null {
  const email = normalizeEmail(target.email);
  const domain = normalizeDomain(target.domain) ?? domainFromEmail(email);
  const phone = normalizePhone(target.phone, { countryCallingCode: target.countryCallingCode });
  const company = normalizeCompany(target.company);

  for (const entry of suppressions) {
    const value = entry.value?.trim() ?? "";
    if (!value) continue;
    switch (entry.scope) {
      case "EMAIL": {
        if (email && normalizeEmail(value) === email) return entry;
        break;
      }
      case "PHONE": {
        if (phone && normalizePhone(value) === phone) return entry;
        break;
      }
      case "COMPANY": {
        if (company && normalizeCompany(value) === company) return entry;
        break;
      }
      case "DOMAIN": {
        if (!domain) break;
        const blocked = normalizeDomain(value);
        if (blocked && (domain === blocked || domain.endsWith(`.${blocked}`))) return entry;
        break;
      }
    }
  }
  return null;
}

/** Throws when the target is suppressed. Called immediately before every send. */
export function assertNotSuppressed(
  suppressions: readonly SuppressionEntry[],
  target: SuppressionTarget,
): void {
  const match = findSuppressionMatch(suppressions, target);
  if (!match) return;
  throw new SendPolicyError(
    "suppressed",
    `recipient is suppressed (${match.scope}: ${match.reason})`,
    409,
    match.scope,
  );
}

/**
 * Throws unless a sender identity is real, verified and permitted to send the
 * given purpose. A persona that has not been verified or explicitly approved
 * for cold mail cannot send.
 */
export function assertSenderIdentityUsable(
  identity: SenderIdentity | null | undefined,
  options: { requireColdApproval: boolean },
): void {
  if (!identity) {
    throw new SendPolicyError("sender_identity_missing", "no sender identity selected", 400);
  }
  if (!identity.email?.trim()) {
    throw new SendPolicyError("sender_identity_missing", "sender identity has no email", 400);
  }
  if (identity.verificationState !== "VERIFIED") {
    throw new SendPolicyError(
      "sender_identity_unverified",
      `sender identity "${identity.displayName}" is ${identity.verificationState.toLowerCase()}; a real, verified inbox is required`,
      403,
    );
  }
  if (!identity.isActive) {
    throw new SendPolicyError(
      "sender_identity_inactive",
      `sender identity "${identity.displayName}" is inactive`,
      403,
    );
  }
  if (options.requireColdApproval) {
    if (!identity.coldApproved || !identity.approvedBy || !identity.approvedAt) {
      throw new SendPolicyError(
        "sender_identity_not_cold_approved",
        `sender identity "${identity.displayName}" has not been approved for cold outreach by an owner`,
        403,
      );
    }
  }
}

export type FollowUpStopReason =
  | "REPLIED"
  | "OPTED_OUT"
  | "HARD_BOUNCED"
  | "MEETING_BOOKED"
  | "MANUALLY_STOPPED"
  | "CONVERTED"
  | "FOLLOW_UP_LIMIT";

/**
 * Human phrasing for each stop reason, so the log explains itself.
 * Wording is kept stable where the outbound log and tests match on
 * "replied" and "meeting booked".
 */
const FOLLOW_UP_STOP_PHRASES: Record<FollowUpStopReason, string> = {
  REPLIED: "the contact already replied",
  OPTED_OUT: "the contact opted out",
  HARD_BOUNCED: "the address hard bounced",
  MEETING_BOOKED: "the recipient has a meeting booked",
  MANUALLY_STOPPED: "a staff member stopped this thread",
  CONVERTED: "the recipient is converted",
  FOLLOW_UP_LIMIT: "this campaign's follow-up limit was reached",
};

export function followUpStopPhrase(reason: FollowUpStopReason): string {
  return FOLLOW_UP_STOP_PHRASES[reason];
}

export interface FollowUpState {
  hasReplied: boolean;
  hasOptedOut: boolean;
  hasHardBounced: boolean;
  meetingBooked: boolean;
  manuallyStopped: boolean;
  converted: boolean;
  maxFollowUps: number;
  followUpsSent: number;
}

/**
 * Returns the reason a follow-up must not be sent, or null when it is allowed.
 * A reply, opt-out, bounce, booked meeting or manual stop ends the sequence.
 */
export function followUpStopReason(state: FollowUpState): FollowUpStopReason | null {
  if (state.hasOptedOut) return "OPTED_OUT";
  if (state.hasHardBounced) return "HARD_BOUNCED";
  if (state.manuallyStopped || state.converted) {
    return state.converted ? "CONVERTED" : "MANUALLY_STOPPED";
  }
  if (state.meetingBooked) return "MEETING_BOOKED";
  if (state.hasReplied) return "REPLIED";
  // Reaching the follow-up cap is not a conversion. It previously reported
  // "CONVERTED", so a normal, healthy end to a campaign sequence logged as
  // though the recipient had won, and staff reading the outbound log had no
  // way to tell the two apart.
  if (state.followUpsSent >= state.maxFollowUps) return "FOLLOW_UP_LIMIT";
  return null;
}

export function assertFollowUpEligible(state: FollowUpState): void {
  const reason = followUpStopReason(state);
  if (!reason) return;
  throw new SendPolicyError("follow_up_not_eligible", `follow-up suppressed: ${followUpStopPhrase(reason)}`, 409);
}

/**
 * The full pre-send gate. Order matters: identity validity is checked before
 * suppression so a misconfigured campaign is reported as a configuration error
 * rather than as a recipient problem.
 */
export function assertSendAllowed(input: {
  identity: SenderIdentity | null | undefined;
  requireColdApproval: boolean;
  suppressions: readonly SuppressionEntry[];
  target: SuppressionTarget;
}): void {
  assertSenderIdentityUsable(input.identity, {
    requireColdApproval: input.requireColdApproval,
  });
  assertNotSuppressed(input.suppressions, input.target);
}

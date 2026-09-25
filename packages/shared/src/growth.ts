// NNACT Pro — Growth & Outreach domain (Stage 1: prospects, senders, suppression).
//
// Single source of truth shared by the API, web and mobile so the prospect
// lifecycle, sender verification states and suppression vocabulary cannot drift
// between surfaces.
//
// The vocabulary is deliberately explicit about provenance: a contact detail
// carries the source and date it was captured, and a sender identity is a real
// verified inbox rather than a persona. Suppression is a first-class record,
// not a boolean flag, because an opt-out must survive export, merge and import.

export const GROWTH_PROSPECT_LIFECYCLE = [
  "NEW",
  "RESEARCHING",
  "VERIFIED",
  "CONTACTED",
  "ENGAGED",
  "MEETING_BOOKED",
  "QUOTED",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
] as const;
export type GrowthProspectLifecycle = (typeof GROWTH_PROSPECT_LIFECYCLE)[number];

/** Lifecycle states that are still workable (not won, lost or blocked). */
export const GROWTH_OPEN_LIFECYCLES: readonly GrowthProspectLifecycle[] = [
  "NEW",
  "RESEARCHING",
  "VERIFIED",
  "CONTACTED",
  "ENGAGED",
  "MEETING_BOOKED",
  "QUOTED",
];

export const GROWTH_PROSPECT_SOURCE = [
  "WEBSITE",
  "REFERRAL",
  "EXISTING_CUSTOMER",
  "EVENTS",
  "DIRECTORY",
  "COLD_RESEARCH",
  "IMPORT",
  "OTHER",
] as const;
export type GrowthProspectSource = (typeof GROWTH_PROSPECT_SOURCE)[number];

export const GROWTH_CONTACT_DETAIL_KIND = ["EMAIL", "PHONE", "WHATSAPP"] as const;
export type GrowthContactDetailKind = (typeof GROWTH_CONTACT_DETAIL_KIND)[number];

export const GROWTH_SENDER_VERIFICATION_STATE = [
  "PENDING",
  "VERIFIED",
  "FAILED",
  "REVOKED",
] as const;
export type GrowthSenderVerificationState = (typeof GROWTH_SENDER_VERIFICATION_STATE)[number];

export const GROWTH_SUPPRESSION_SCOPE = ["EMAIL", "DOMAIN", "PHONE", "COMPANY"] as const;
export type GrowthSuppressionScope = (typeof GROWTH_SUPPRESSION_SCOPE)[number];

export const GROWTH_SUPPRESSION_REASON = [
  "OPT_OUT",
  "HARD_BOUNCE",
  "COMPLAINT",
  "MANUAL_BLOCK",
  "LEGAL_REQUEST",
  "PREVIOUS_CUSTOMER_DO_NOT_CONTACT",
  "OTHER",
] as const;
export type GrowthSuppressionReason = (typeof GROWTH_SUPPRESSION_REASON)[number];

/** Human labels for the sender registry. */
export const GROWTH_SENDER_VERIFICATION_LABELS: Record<GrowthSenderVerificationState, string> = {
  PENDING: "Awaiting verification",
  VERIFIED: "Verified",
  FAILED: "Verification failed",
  REVOKED: "Revoked",
};

export const GROWTH_SUPPRESSION_REASON_LABELS: Record<GrowthSuppressionReason, string> = {
  OPT_OUT: "Opted out",
  HARD_BOUNCE: "Hard bounce",
  COMPLAINT: "Complaint",
  MANUAL_BLOCK: "Manually blocked",
  LEGAL_REQUEST: "Legal request",
  PREVIOUS_CUSTOMER_DO_NOT_CONTACT: "Existing customer — do not contact",
  OTHER: "Other",
};

export interface GrowthContactDetailDTO {
  id: string;
  prospectId: string;
  kind: GrowthContactDetailKind;
  label?: string | null;
  /** Value exactly as recorded, for display and audit. */
  value: string;
  isPrimary: boolean;
  /** Where this detail came from, e.g. "company website", "trade directory". */
  source?: string | null;
  sourceUrl?: string | null;
  /** When the detail was captured or last confirmed. */
  sourceDate?: string | null;
  createdAt: string;
}

export interface GrowthProspectDTO {
  id: string;
  companyName: string;
  websiteDomain?: string | null;
  industry?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  equipmentNeeds?: string | null;
  lifecycle: GrowthProspectLifecycle;
  source: GrowthProspectSource;
  sourceDetail?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
  linkedCustomerId?: string | null;
  /** Set when this prospect was merged into another record. */
  mergedIntoId?: string | null;
  verifiedAt?: string | null;
  lastContactedAt?: string | null;
  contacts?: GrowthContactDetailDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface GrowthSenderIdentityDTO {
  id: string;
  displayName: string;
  /** The real sending/receiving inbox. */
  email: string;
  replyToEmail?: string | null;
  roleTitle?: string | null;
  verificationState: GrowthSenderVerificationState;
  verificationMethod?: string | null;
  verifiedAt?: string | null;
  /** Whether an owner approved this identity for cold outreach. */
  coldApproved: boolean;
  coldApprovedAt?: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface GrowthSuppressionDTO {
  id: string;
  scope: GrowthSuppressionScope;
  /** Value as recorded. */
  value: string;
  reason: GrowthSuppressionReason;
  note?: string | null;
  createdAt: string;
}

/** Result of the duplicate check run before a prospect is created. */
export interface GrowthDuplicateMatchDTO {
  prospectId: string;
  companyName: string;
  websiteDomain?: string | null;
  /** Which normalized field matched, e.g. "EMAIL", "DOMAIN", "PHONE", "COMPANY". */
  matchedOn: string;
}

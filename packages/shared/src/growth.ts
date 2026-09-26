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
  /** Id of the existing prospect that matched. */
  id: string;
  companyName: string;
  websiteDomain?: string | null;
  /** Which normalized field matched, e.g. "EMAIL", "DOMAIN", "PHONE", "COMPANY". */
  matchedOn: GrowthDuplicateField;
  /** 0–100; higher is stronger evidence that both records are the same entity. */
  score: number;
}

/** Fields the duplicate check can match on. */
export const GROWTH_DUPLICATE_FIELDS = ["EMAIL", "DOMAIN", "PHONE", "COMPANY"] as const;
export type GrowthDuplicateField = (typeof GROWTH_DUPLICATE_FIELDS)[number];

/** Campaign taxonomy. Mirrors growth_campaign_purpose in the database. */
export const GROWTH_CAMPAIGN_PURPOSE = [
  "COLD_OUTREACH",
  "PERMISSION_MARKETING",
  "EXISTING_CUSTOMER",
] as const;
export type GrowthCampaignPurpose = (typeof GROWTH_CAMPAIGN_PURPOSE)[number];

export const GROWTH_CAMPAIGN_PURPOSE_LABELS: Record<GrowthCampaignPurpose, string> = {
  COLD_OUTREACH: "Cold outreach",
  PERMISSION_MARKETING: "Permission marketing",
  EXISTING_CUSTOMER: "Existing customer",
};

/** Mirrors growth_campaign_status in the database. */
export const GROWTH_CAMPAIGN_STATUS = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type GrowthCampaignStatus = (typeof GROWTH_CAMPAIGN_STATUS)[number];

export const GROWTH_CAMPAIGN_STATUS_LABELS: Record<GrowthCampaignStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Mirrors growth_campaign_recipient_status in the database. */
export const GROWTH_RECIPIENT_STATUS = [
  "PENDING",
  "QUEUED",
  "SENT",
  "REPLIED",
  "OPTED_OUT",
  "BOUNCED",
  "SUPPRESSED",
  "BLOCKED",
  "SKIPPED",
  "CONVERTED",
] as const;
export type GrowthRecipientStatus = (typeof GROWTH_RECIPIENT_STATUS)[number];

/** Mirrors growth_outbound_status in the database. */
export const GROWTH_OUTBOUND_STATUS = [
  "QUEUED",
  "SENT",
  "FAILED",
  "SUPPRESSED",
  "BLOCKED",
] as const;
export type GrowthOutboundStatus = (typeof GROWTH_OUTBOUND_STATUS)[number];

export const GROWTH_OUTBOUND_STATUS_LABELS: Record<GrowthOutboundStatus, string> = {
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
  SUPPRESSED: "Suppressed",
  BLOCKED: "Blocked",
};

// ────────────────────────────────────────────────────────────────────────────
// Stage 2 — Project Knowledge (company intelligence)
//
// A knowledge fact is only usable in outreach once a human has approved it, and
// it always carries the passage and location it came from. The vocabulary below
// keeps "where did this come from", "how sure are we" and "may we say it" as
// separate, explicit fields, because conflating them is how a private
// operational record silently becomes a public sales claim.
// ────────────────────────────────────────────────────────────────────────────

/** What kind of material a fact was extracted from. */
export const GROWTH_KNOWLEDGE_SOURCE_TYPE = [
  "WEBSITE",
  "INTERNAL_DOCUMENT",
  "MANUAL_ENTRY",
  "AI_INFERENCE",
] as const;
export type GrowthKnowledgeSourceType = (typeof GROWTH_KNOWLEDGE_SOURCE_TYPE)[number];

/**
 * Approval lifecycle. Only APPROVED facts may be used in campaign copy; PENDING
 * is what a human reviews, REJECTED/OBSOLETE are retained for audit but are
 * never quotable.
 */
export const GROWTH_KNOWLEDGE_STATUS = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "OBSOLETE",
] as const;
export type GrowthKnowledgeStatus = (typeof GROWTH_KNOWLEDGE_STATUS)[number];

/** How a fact was established, independent of approval. */
export const GROWTH_KNOWLEDGE_PROVENANCE = [
  /** Quoted or directly stated in the source; safe to attribute. */
  "SOURCED",
  /** Reasonable reading of a source passage; a human must confirm wording. */
  "INFERRED",
  /** Typed by a person. Authoritative, but still attributable to them. */
  "MANUAL",
] as const;
export type GrowthKnowledgeProvenance = (typeof GROWTH_KNOWLEDGE_PROVENANCE)[number];

/** What the fact is about, used to group review and to gate campaign claims. */
export const GROWTH_KNOWLEDGE_CATEGORY = [
  "COMPANY_IDENTITY",
  "CONTACT_DETAILS",
  "SERVICE_AREA",
  "SERVICES",
  "EQUIPMENT_TYPES",
  "INDUSTRIES_SERVED",
  "POSITIONING",
  "CREDENTIALS",
  "GUARANTEES",
  "CASE_STUDIES",
  "CUSTOMER_REFERENCES",
  "PRICING",
  "CALL_TO_ACTION",
  "SALES_MATERIALS",
] as const;
export type GrowthKnowledgeCategory = (typeof GROWTH_KNOWLEDGE_CATEGORY)[number];

/** Human labels for the knowledge review queue. */
export const GROWTH_KNOWLEDGE_CATEGORY_LABELS: Record<GrowthKnowledgeCategory, string> = {
  COMPANY_IDENTITY: "Company identity",
  CONTACT_DETAILS: "Contact details",
  SERVICE_AREA: "Service area",
  SERVICES: "Services",
  EQUIPMENT_TYPES: "Equipment types",
  INDUSTRIES_SERVED: "Industries served",
  POSITIONING: "Positioning",
  CREDENTIALS: "Credentials",
  GUARANTEES: "Guarantees",
  CASE_STUDIES: "Case studies",
  CUSTOMER_REFERENCES: "Customer references",
  PRICING: "Pricing",
  CALL_TO_ACTION: "Call to action",
  SALES_MATERIALS: "Sales materials",
};

export const GROWTH_KNOWLEDGE_STATUS_LABELS: Record<GrowthKnowledgeStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  OBSOLETE: "Obsolete",
};

export const GROWTH_KNOWLEDGE_PROVENANCE_LABELS: Record<GrowthKnowledgeProvenance, string> = {
  SOURCED: "Sourced",
  INFERRED: "Inferred",
  MANUAL: "Manual entry",
};

export const GROWTH_KNOWLEDGE_SOURCE_TYPE_LABELS: Record<GrowthKnowledgeSourceType, string> = {
  WEBSITE: "Website",
  INTERNAL_DOCUMENT: "Internal document",
  MANUAL_ENTRY: "Manual entry",
  AI_INFERENCE: "AI proposal",
};

/** Only these categories may be quoted in outreach copy. */
export const GROWTH_CAMPAIGN_SAFE_CATEGORIES: readonly GrowthKnowledgeCategory[] = [
  "COMPANY_IDENTITY",
  "CONTACT_DETAILS",
  "SERVICE_AREA",
  "SERVICES",
  "EQUIPMENT_TYPES",
  "INDUSTRIES_SERVED",
  "POSITIONING",
  "CREDENTIALS",
  "GUARANTEES",
  "CASE_STUDIES",
  "CUSTOMER_REFERENCES",
  "CALL_TO_ACTION",
];

/** Categories that are internal-only: quoting them externally is not a sales claim. */
export const GROWTH_INTERNAL_ONLY_CATEGORIES: readonly GrowthKnowledgeCategory[] = ["PRICING"];

/** Result of one ingestion pass over a source. */
export const GROWTH_INGEST_STATUS = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "BLOCKED",
] as const;
export type GrowthIngestStatus = (typeof GROWTH_INGEST_STATUS)[number];

export interface GrowthKnowledgeFactDTO {
  id: string;
  factKey: string;
  category: GrowthKnowledgeCategory;
  subject: string;
  supportingPassage?: string | null;
  sourceType: GrowthKnowledgeSourceType;
  sourceUrl?: string | null;
  sourceDocumentId?: string | null;
  sourceTitle?: string | null;
  extractedAt?: string | null;
  /** 0–100 confidence that the passage supports the subject. */
  confidence: number;
  provenance: GrowthKnowledgeProvenance;
  status: GrowthKnowledgeStatus;
  manuallyCorrected: boolean;
  approvedAt?: string | null;
  rejectedReason?: string | null;
  lastReviewedAt?: string | null;
  contradictionGroup?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthKnowledgeIngestRunDTO {
  id: string;
  sourceType: string;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  status: GrowthIngestStatus;
  extractor: string;
  factsSeen: number;
  factsCreated: number;
  factsSkipped: number;
  missingCategories: string[];
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export const GROWTH_COMPETITOR_CLASSIFICATION = [
  "DIRECT_LOCAL",
  "REGIONAL",
  "INTERNATIONAL_REFERENCE",
  "UNRELATED",
] as const;
export type GrowthCompetitorClassification = (typeof GROWTH_COMPETITOR_CLASSIFICATION)[number];

export const GROWTH_COMPETITOR_REVIEW_STATUS = [
  "SUGGESTED",
  "APPROVED",
  "REJECTED",
  "EXCLUDED",
] as const;
export type GrowthCompetitorReviewStatus = (typeof GROWTH_COMPETITOR_REVIEW_STATUS)[number];

export interface GrowthCompetitorDTO {
  id: string;
  name: string;
  websiteDomain?: string | null;
  classification: GrowthCompetitorClassification;
  reviewStatus: GrowthCompetitorReviewStatus;
  geography?: string | null;
  services?: string | null;
  targetCustomers?: string | null;
  positioning?: string | null;
  visibleOffers?: string | null;
  evidenceSummary?: string | null;
  sourceUrls: string[];
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthSectorDTO {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  pinned: boolean;
  excluded: boolean;
  paused: boolean;
  services: string[];
  equipmentTypes: string[];
  hypotheses: { text: string; supported: boolean; evidenceIds?: string[] }[];
  decisionMakers?: string | null;
  prospectCriteria?: string | null;
  offerTemplate?: string | null;
  callToAction?: string | null;
  allocationWeight: number;
  manualAllocationOverride?: number | null;
  minSampleSize: number;
  observationDays: number;
  createdAt: string;
  updatedAt: string;
}

export const GROWTH_AUTOPILOT_MODES = ["OBSERVE", "ASSISTED", "AUTOPILOT"] as const;
export type GrowthAutopilotMode = (typeof GROWTH_AUTOPILOT_MODES)[number];

export interface GrowthAutopilotSettingsDTO {
  mode: GrowthAutopilotMode;
  paused: boolean;
  pausedAt?: string | null;
  dailySendCap: number;
  dailyBudgetCents: number;
  explorationPercent: number;
  approvedSectorIds: string[];
  approvedSenderIds: string[];
  lastCycleAt?: string | null;
  /** Whether cold transport is configured and permitted for cold campaigns. */
  coldTransportReady: boolean;
}

export interface GrowthAutopilotDecisionDTO {
  id: string;
  sectorId?: string | null;
  sectorName?: string | null;
  cycleId: string;
  previousAllocation: number;
  newAllocation: number;
  reasoning: string;
  inputs: Record<string, unknown>;
  createdAt: string;
}

export const GROWTH_REPLY_INTENTS = [
  "INTERESTED",
  "PRICING",
  "VERIFICATION",
  "SCHEDULING",
  "NOT_INTERESTED",
  "UNSUBSCRIBE",
  "COMPLAINT",
  "AUTO_REPLY",
  "OTHER",
] as const;
export type GrowthReplyIntent = (typeof GROWTH_REPLY_INTENTS)[number];

export interface GrowthInboxThreadDTO {
  id: string;
  prospectId: string;
  companyName?: string;
  contactDetailId?: string | null;
  campaignId?: string | null;
  senderIdentityId?: string | null;
  senderDisplayName?: string | null;
  senderEmail?: string | null;
  subject?: string | null;
  lastMessageAt: string;
  needsHumanReply: boolean;
  verificationRequestedAt?: string | null;
}

export interface GrowthInboxMessageDTO {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND";
  fromEmail: string;
  toEmail: string;
  subject?: string | null;
  bodyText: string;
  intent?: GrowthReplyIntent | null;
  createdAt: string;
}

export interface GrowthReplyDraftDTO {
  id: string;
  threadId: string;
  language: string;
  draftText: string;
  contextSources: unknown[];
  knowledgeFactIds: string[];
  requiresHuman: boolean;
  humanRouteReason?: string | null;
  status: string;
  createdAt: string;
}

/** Growth intelligence overview for the dashboard. */
export interface GrowthIntelligenceOverviewDTO {
  pendingKnowledgeFacts: number;
  contradictions: number;
  suggestedCompetitors: number;
  autopilotMode: GrowthAutopilotMode;
  autopilotPaused: boolean;
  sectorsActive: number;
  threadsNeedingHuman: number;
  coldTransportReady: boolean;
}

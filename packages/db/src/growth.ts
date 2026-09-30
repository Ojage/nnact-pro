// NNACT Pro — Growth & Outreach module (Stage 1 data model).
// Multi-tenant (org_id everywhere). Model split:
//   • growth_prospects         — researched companies and the named contact
//   • growth_contact_details   — each contact detail with its source and date
//   • growth_sender_identities — real, owner-verified sender inboxes
//   • growth_suppressions      — opt-outs, blocks, bounces, complaints
//
// Suppression and contact tables store the value twice: `value` preserves what
// was recorded for audit, while `normalized_value` holds the comparison form
// used for lookups (see growth/send-policy.ts). Never collapse the two: the
// source and date of a contact detail are the point of the table.
//
// Taxonomy values mirror the shared domain in @nnact/shared/src/growth.ts.

import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { orgs, users, customers } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

export const growthProspectLifecycle = pgEnum("growth_prospect_lifecycle", [
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
]);

export const growthProspectSource = pgEnum("growth_prospect_source", [
  "WEBSITE",
  "REFERRAL",
  "EXISTING_CUSTOMER",
  "EVENTS",
  "DIRECTORY",
  "COLD_RESEARCH",
  "IMPORT",
  "OTHER",
]);

export const growthContactDetailKind = pgEnum("growth_contact_detail_kind", [
  "EMAIL",
  "PHONE",
  "WHATSAPP",
]);

export const growthSenderVerificationState = pgEnum("growth_sender_verification_state", [
  "PENDING",
  "VERIFIED",
  "FAILED",
  "REVOKED",
]);

export const growthSuppressionScope = pgEnum("growth_suppression_scope", [
  "EMAIL",
  "DOMAIN",
  "PHONE",
  "COMPANY",
]);

export const growthSuppressionReason = pgEnum("growth_suppression_reason", [
  "OPT_OUT",
  "HARD_BOUNCE",
  "COMPLAINT",
  "MANUAL_BLOCK",
  "LEGAL_REQUEST",
  "PREVIOUS_CUSTOMER_DO_NOT_CONTACT",
  "OTHER",
]);

// ────────────────────────────────────────────────────────────────────────────
// Sender identities
//
// A sender identity is only usable when it is backed by an inbox the operator
// actually controls and has been verified. There is deliberately no free-text
// persona field: `display_name` labels a real mailbox, it does not invent one.
// Cold use additionally requires a recorded owner approval.
// ────────────────────────────────────────────────────────────────────────────

export const growthSenderIdentities = pgTable(
  "growth_sender_identities",
  {
    id: id(),
    orgId: orgId(),
    /** Label for the From header, e.g. "Dana Reeves". Must correspond to a real person. */
    displayName: text("display_name").notNull(),
    /** The real sending/receiving inbox. Unique per org. */
    email: text("email").notNull(),
    /** Optional shared reply-to, e.g. a team inbox on the same verified domain. */
    replyToEmail: text("reply_to_email"),
    roleTitle: text("role_title"),
    verificationState: growthSenderVerificationState("verification_state").default("PENDING").notNull(),
    /** How ownership of the inbox was proven, e.g. "DNS TXT" or "reply test". */
    verificationMethod: text("verification_method"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Owner approval required before this identity may send cold outreach. */
    coldApproved: boolean("cold_approved").default(false).notNull(),
    coldApprovedBy: uuid("cold_approved_by").references(() => users.id, { onDelete: "set null" }),
    coldApprovedAt: timestamp("cold_approved_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("growth_sender_identities_org_idx").on(t.orgId),
    emailUnique: uniqueIndex("growth_sender_identities_org_email_uq").on(t.orgId, t.email),
    activeIdx: index("growth_sender_identities_active_idx").on(t.orgId, t.isActive),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Prospects
// ────────────────────────────────────────────────────────────────────────────

export const growthProspects = pgTable(
  "growth_prospects",
  {
    id: id(),
    orgId: orgId(),
    companyName: text("company_name").notNull(),
    /** Registrable domain, e.g. "acme.co.za". Used for duplicate detection and domain suppression. */
    websiteDomain: text("website_domain"),
    industry: text("industry"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    /** Free-text summary of the equipment or service need, e.g. "3 rooftop units, no maintenance history". */
    equipmentNeeds: text("equipment_needs"),
    lifecycle: growthProspectLifecycle("lifecycle").default("NEW").notNull(),
    source: growthProspectSource("source").default("COLD_RESEARCH").notNull(),
    sourceDetail: text("source_detail"),
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    /** Set when the prospect is converted into a real customer record. */
    linkedCustomerId: uuid("linked_customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** Set when this prospect was merged into another; the row is retained for audit. */
    mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => growthProspects.id, {
      onDelete: "set null",
    }),
    /** When a human confirmed the details were real and researched. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    /** Target sector slug from discovery or campaign enrolment. */
    sectorSlug: text("sector_slug"),
    /** 0–100 fit score from discovery rules or human review. */
    fitScore: integer("fit_score"),
    fitSummary: text("fit_summary"),
    /** Structured evidence: sources, hypotheses, reviewer notes. */
    fitEvidence: jsonb("fit_evidence").default([]).notNull(),
    emailVerificationStatus: text("email_verification_status"),
    lastResearchedAt: timestamp("last_researched_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
    version: version(),
  },
  (t) => ({
    orgIdx: index("growth_prospects_org_idx").on(t.orgId),
    lifecycleIdx: index("growth_prospects_lifecycle_idx").on(t.orgId, t.lifecycle),
    domainIdx: index("growth_prospects_domain_idx").on(t.orgId, t.websiteDomain),
    companyIdx: index("growth_prospects_company_idx").on(t.orgId, t.companyName),
    assignedIdx: index("growth_prospects_assigned_idx").on(t.orgId, t.assignedTo),
    sectorIdx: index("growth_prospects_sector_idx").on(t.orgId, t.sectorSlug),
    fitIdx: index("growth_prospects_fit_idx").on(t.orgId, t.fitScore),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Contact details (with provenance)
// ────────────────────────────────────────────────────────────────────────────

export const growthContactDetails = pgTable(
  "growth_contact_details",
  {
    id: id(),
    orgId: orgId(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    kind: growthContactDetailKind("kind").notNull(),
    /** Human label for the contact, e.g. "Facilities Manager". */
    label: text("label"),
    /** Value as recorded, preserved for audit. */
    value: text("value").notNull(),
    /** Comparison form used for lookups (lowercased email/domain, folded phone). */
    normalizedValue: text("normalized_value").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    /** Where this detail came from, e.g. "company website", "trade directory", "call with receptionist". */
    source: text("source"),
    /** Specific URL or reference the detail was taken from. */
    sourceUrl: text("source_url"),
    /** Date the detail was captured or last confirmed. */
    sourceDate: timestamp("source_date", { withTimezone: true }),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    prospectIdx: index("growth_contact_details_prospect_idx").on(t.prospectId),
    lookupIdx: index("growth_contact_details_lookup_idx").on(t.orgId, t.normalizedValue),
    kindIdx: index("growth_contact_details_kind_idx").on(t.orgId, t.kind),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Suppressions
// ────────────────────────────────────────────────────────────────────────────

export const growthSuppressions = pgTable(
  "growth_suppressions",
  {
    id: id(),
    orgId: orgId(),
    scope: growthSuppressionScope("scope").notNull(),
    /** Value as recorded, preserved for audit and display. */
    value: text("value").notNull(),
    /** Comparison form used for lookups. */
    normalizedValue: text("normalized_value").notNull(),
    reason: growthSuppressionReason("reason").notNull(),
    note: text("note"),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    uniqueIdx: uniqueIndex("growth_suppressions_scope_value_uq").on(
      t.orgId,
      t.scope,
      t.normalizedValue,
    ),
    lookupIdx: index("growth_suppressions_lookup_idx").on(t.orgId, t.normalizedValue),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Campaigns
//
// A campaign is a sequence of steps sent from ONE real sender identity. The
// `purpose` column is the reason the transport policy exists: it decides which
// outbound transport may carry the campaign, and a COLD_OUTREACH campaign is
// refused outright until a compliant cold transport is configured.
// ────────────────────────────────────────────────────────────────────────────

export const growthCampaignPurpose = pgEnum("growth_campaign_purpose", [
  "COLD_OUTREACH",
  "PERMISSION_MARKETING",
  "EXISTING_CUSTOMER",
]);

export const growthCampaignStatus = pgEnum("growth_campaign_status", [
  "DRAFT",
  "RESEARCHING",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
]);

export const growthCampaignRecipientStatus = pgEnum("growth_campaign_recipient_status", [
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
]);

export const growthOutboundStatus = pgEnum("growth_outbound_status", [
  "QUEUED",
  "SENT",
  "FAILED",
  "SUPPRESSED",
  "BLOCKED",
]);

export const growthCampaigns = pgTable(
  "growth_campaigns",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    /** When set, outcomes roll up to sector intelligence and Autopilot allocation. */
    sectorId: uuid("sector_id"),
    /** True when Autopilot created or manages this campaign. */
    autopilotManaged: boolean("autopilot_managed").default(false).notNull(),
    /** Drives transport selection. See growth/transport-policy.ts. */
    purpose: growthCampaignPurpose("purpose").default("COLD_OUTREACH").notNull(),
    status: growthCampaignStatus("status").default("DRAFT").notNull(),
    /** The real, verified identity this campaign sends from. */
    senderIdentityId: uuid("sender_identity_id")
      .notNull()
      .references(() => growthSenderIdentities.id, { onDelete: "restrict" }),
    /** Recorded owner approval, required before any send. */
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    /** Hour (0–23) in `timezone` used to decide when a send is due. */
    quietHoursStart: integer("quiet_hours_start").default(20),
    quietHoursEnd: integer("quiet_hours_end").default(8),
    timezone: text("timezone").default("Africa/Douala").notNull(),
    language: text("language").default("EN").notNull(),
    /** JSON rules: cities, sector slug, min fit score, equipment keywords. */
    prospectSelectionRules: jsonb("prospect_selection_rules").default({}).notNull(),
    offerSummary: text("offer_summary"),
    businessGoal: text("business_goal"),
    weeklyLimit: integer("weekly_limit"),
    totalContactCap: integer("total_contact_cap"),
    budgetCapCents: integer("budget_cap_cents"),
    /** Maximum messages sent per day across the campaign. */
    dailyLimit: integer("daily_limit").default(50).notNull(),
    /** Maximum follow-up steps per recipient, on top of the first step. */
    maxFollowUps: integer("max_follow_ups").default(2).notNull(),
    notes: text("notes"),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("growth_campaigns_org_idx").on(t.orgId),
    statusIdx: index("growth_campaigns_status_idx").on(t.orgId, t.status),
    senderIdx: index("growth_campaigns_sender_idx").on(t.orgId, t.senderIdentityId),
  }),
);

export const growthCampaignSteps = pgTable(
  "growth_campaign_steps",
  {
    id: id(),
    orgId: orgId(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => growthCampaigns.id, { onDelete: "cascade" }),
    /** 1-based position in the sequence. */
    stepNumber: integer("step_number").notNull(),
    /** Days to wait after the previous step was sent. */
    delayDays: integer("delay_days").default(0).notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    campaignIdx: index("growth_campaign_steps_campaign_idx").on(t.orgId, t.campaignId),
    stepNumberUnique: uniqueIndex("growth_campaign_steps_number_uq").on(t.campaignId, t.stepNumber),
  }),
);

/**
 * Recipients. The stop signals (replied, opted out, bounced, meeting booked,
 * manually stopped) are stored on the recipient row so a follow-up decision
 * never depends on reconstructing a timeline.
 */
export const growthCampaignRecipients = pgTable(
  "growth_campaign_recipients",
  {
    id: id(),
    orgId: orgId(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => growthCampaigns.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    /** The exact contact detail this campaign addresses. */
    contactDetailId: uuid("contact_detail_id")
      .notNull()
      .references(() => growthContactDetails.id, { onDelete: "cascade" }),
    status: growthCampaignRecipientStatus("status").default("PENDING").notNull(),
    /** Highest step number sent so far; 0 before the first send. */
    currentStep: integer("current_step").default(0).notNull(),
    followUpsSent: integer("follow_ups_sent").default(0).notNull(),
    /** A/B variant label frozen after first send for this recipient. */
    abVariant: text("ab_variant"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    /**
     * Spam/abuse complaint from the ESP. Tracked separately from `optedOutAt`
     * because the two carry very different weight: a complaint is scored as a
     * much more serious signal than a polite unsubscribe, and folding them
     * together hid complaint pressure from Autopilot allocation entirely.
     */
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    meetingBookedAt: timestamp("meeting_booked_at", { withTimezone: true }),
    manuallyStoppedAt: timestamp("manually_stopped_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    campaignIdx: index("growth_campaign_recipients_campaign_idx").on(t.orgId, t.campaignId),
    statusIdx: index("growth_campaign_recipients_status_idx").on(t.orgId, t.status),
    // One row per contact detail per campaign, so a re-run cannot double-enrol.
    contactUnique: uniqueIndex("growth_campaign_recipients_contact_uq").on(t.campaignId, t.contactDetailId),
  }),
);

/**
 * Outbound event log. Every attempt is recorded, including refusals, so a
 * blocked send is auditable rather than silent. `idempotency_key` is unique per
 * org: a retried or re-run send for the same recipient+step is recorded as a
 * duplicate and never delivered twice.
 */
export const growthOutboundMessages = pgTable(
  "growth_outbound_messages",
  {
    id: id(),
    orgId: orgId(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => growthCampaigns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => growthCampaignSteps.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => growthCampaignRecipients.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    /** `${campaignId}:${recipientId}:${stepNumber}` — unique per org. */
    idempotencyKey: text("idempotency_key").notNull(),
    purpose: growthCampaignPurpose("purpose").notNull(),
    transportId: text("transport_id").notNull(),
    senderIdentityId: uuid("sender_identity_id")
      .notNull()
      .references(() => growthSenderIdentities.id, { onDelete: "restrict" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    /** Immutable copy of content at send time; step edits must not rewrite history. */
    subjectSnapshot: text("subject_snapshot"),
    bodyTextSnapshot: text("body_text_snapshot"),
    fromEmail: text("from_email"),
    fromDisplayName: text("from_display_name"),
    status: growthOutboundStatus("status").default("QUEUED").notNull(),
    providerMessageId: text("provider_message_id"),
    /** Unified inbox thread when this send was mirrored into conversations. */
    inboxThreadId: uuid("inbox_thread_id"),
    /** Machine-readable refusal code, e.g. "suppressed" or "cold_transport_not_configured". */
    blockedReason: text("blocked_reason"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    idempotencyUnique: uniqueIndex("growth_outbound_messages_idempotency_uq").on(
      t.orgId,
      t.idempotencyKey,
    ),
    campaignIdx: index("growth_outbound_messages_campaign_idx").on(t.orgId, t.campaignId),
    statusIdx: index("growth_outbound_messages_status_idx").on(t.orgId, t.status),
    sentAtIdx: index("growth_outbound_messages_sent_at_idx").on(t.orgId, t.sentAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 2 — Project Knowledge
//
// Facts are append-only proposals with an explicit review lifecycle. A refresh
// never overwrites a fact a human touched: `growth_knowledge_fact_revisions`
// records every change, and `manually_corrected` marks a fact whose wording a
// human owns, so re-ingestion proposes a new fact instead of clobbering it.
//
// The contract that matters for outreach: a fact is quotable only when
// `status = 'APPROVED'`. Anything else (PENDING, REJECTED, OBSOLETE) exists for
// review and audit and must never reach campaign copy — see
// growth/knowledge.ts for the gate that enforces this.
// ────────────────────────────────────────────────────────────────────────────

export const growthKnowledgeFacts = pgTable(
  "growth_knowledge_facts",
  {
    id: id(),
    orgId: orgId(),
    /** Stable identity across refreshes: category + normalized subject. */
    factKey: text("fact_key").notNull(),
    category: text("category").notNull(),
    /** The short, quotable statement, e.g. "24/7 emergency call-out in Buea". */
    subject: text("subject").notNull(),
    /** The passage from the source that supports `subject`. */
    supportingPassage: text("supporting_passage"),
    sourceType: text("source_type").notNull(),
    /** Public page URL, or "file:<id>" for internal material. */
    sourceUrl: text("source_url"),
    sourceDocumentId: uuid("source_document_id"),
    sourceTitle: text("source_title"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    /** 0–1. How strongly the passage supports the claim. */
    confidence: integer("confidence").default(0).notNull(),
    provenance: text("provenance").notNull(),
    status: text("status").default("PENDING").notNull(),
    /** True once a human edits or approves: refresh must not overwrite it. */
    manuallyCorrected: boolean("manually_corrected").default(false).notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    /** Grouped key when two sources disagree; resolution is a human action. */
    contradictionGroup: text("contradiction_group"),
    supersededById: uuid("superseded_by_id"),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgFactUnique: uniqueIndex("growth_knowledge_facts_org_fact_key_uq").on(t.orgId, t.factKey),
    orgStatusIdx: index("growth_knowledge_facts_org_status_idx").on(t.orgId, t.status),
    orgCategoryIdx: index("growth_knowledge_facts_org_category_idx").on(t.orgId, t.category),
    contradictionIdx: index("growth_knowledge_facts_contradiction_idx").on(
      t.orgId,
      t.contradictionGroup,
    ),
  }),
);

/** One ingestion pass, so refreshes are auditable and failures are visible. */
export const growthKnowledgeIngestRuns = pgTable(
  "growth_knowledge_ingest_runs",
  {
    id: id(),
    orgId: orgId(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    status: text("status").notNull(),
    /** Which extractor produced the facts: deterministic, or the AI provider. */
    extractor: text("extractor").notNull(),
    factsSeen: integer("facts_seen").default(0).notNull(),
    factsCreated: integer("facts_created").default(0).notNull(),
    factsSkipped: integer("facts_skipped").default(0).notNull(),
    /** Facts the source did not yield, so the UI can prompt for manual entry. */
    missingCategories: text("missing_categories").array().default([]).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    orgIdx: index("growth_knowledge_ingest_runs_org_idx").on(t.orgId, t.startedAt),
  }),
);

/** Full change history for a fact: who changed the wording, when, and to what. */
export const growthKnowledgeFactRevisions = pgTable(
  "growth_knowledge_fact_revisions",
  {
    id: id(),
    orgId: orgId(),
    factId: uuid("fact_id")
      .notNull()
      .references(() => growthKnowledgeFacts.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    previousSubject: text("previous_subject"),
    newSubject: text("new_subject"),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    note: text("note"),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    factIdx: index("growth_knowledge_fact_revisions_fact_idx").on(t.factId, t.changedAt),
  }),
);

/** Administrator-approved internal files eligible for knowledge extraction. */
export const growthKnowledgeDocuments = pgTable(
  "growth_knowledge_documents",
  {
    id: id(),
    orgId: orgId(),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Optional link to the shared documents blob store (`documents` table). */
    blobDocumentId: uuid("blob_document_id"),
    /** Plain-text extract used for ingestion when no blob is stored. */
    textContent: text("text_content"),
    approvedForKnowledge: boolean("approved_for_knowledge").default(false).notNull(),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("growth_knowledge_documents_org_idx").on(t.orgId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — Competitors & market intelligence
// ────────────────────────────────────────────────────────────────────────────

export const growthCompetitorClassification = pgEnum("growth_competitor_classification", [
  "DIRECT_LOCAL",
  "REGIONAL",
  "INTERNATIONAL_REFERENCE",
  "UNRELATED",
]);

export const growthCompetitorReviewStatus = pgEnum("growth_competitor_review_status", [
  "SUGGESTED",
  "APPROVED",
  "REJECTED",
  "EXCLUDED",
]);

export const growthCompetitors = pgTable(
  "growth_competitors",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    websiteDomain: text("website_domain"),
    classification: growthCompetitorClassification("classification").default("REGIONAL").notNull(),
    reviewStatus: growthCompetitorReviewStatus("review_status").default("SUGGESTED").notNull(),
    geography: text("geography"),
    services: text("services"),
    targetCustomers: text("target_customers"),
    positioning: text("positioning"),
    visibleOffers: text("visible_offers"),
    /** Why this business is considered relevant — must cite geography or category overlap. */
    evidenceSummary: text("evidence_summary"),
    sourceUrls: text("source_urls").array().default([]).notNull(),
    reviewNotes: text("review_notes"),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("growth_competitors_org_idx").on(t.orgId),
    domainIdx: index("growth_competitors_domain_idx").on(t.orgId, t.websiteDomain),
    statusIdx: index("growth_competitors_status_idx").on(t.orgId, t.reviewStatus),
  }),
);

/** Versioned comparison snapshots; earlier versions are retained for audit. */
export const growthCompetitorAnalyses = pgTable(
  "growth_competitor_analyses",
  {
    id: id(),
    orgId: orgId(),
    version: integer("version").notNull(),
    /** Plain-language comparison for managers. */
    summary: text("summary").notNull(),
    /** Structured comparison: advantages, gaps, offers to strengthen. */
    comparison: jsonb("comparison").notNull(),
    sourceCompetitorIds: uuid("source_competitor_ids").array().default([]).notNull(),
    generatedBy: text("generated_by").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    orgVersionIdx: uniqueIndex("growth_competitor_analyses_org_version_uq").on(t.orgId, t.version),
    orgIdx: index("growth_competitor_analyses_org_idx").on(t.orgId, t.createdAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — Sector opportunities
// ────────────────────────────────────────────────────────────────────────────

export const growthSectors = pgTable(
  "growth_sectors",
  {
    id: id(),
    orgId: orgId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /** Administrator pin: allocation never drops below floor while pinned. */
    pinned: boolean("pinned").default(false).notNull(),
    excluded: boolean("excluded").default(false).notNull(),
    paused: boolean("paused").default(false).notNull(),
    services: text("services").array().default([]).notNull(),
    equipmentTypes: text("equipment_types").array().default([]).notNull(),
    /** Hypotheses are labelled until backed by sector evidence rows. */
    hypotheses: jsonb("hypotheses").default([]).notNull(),
    decisionMakers: text("decision_makers"),
    prospectCriteria: text("prospect_criteria"),
    offerTemplate: text("offer_template"),
    callToAction: text("call_to_action"),
    /** 0–100 relative weight used by allocation (may be overridden by Autopilot). */
    allocationWeight: integer("allocation_weight").default(100).notNull(),
    manualAllocationOverride: integer("manual_allocation_override"),
    minSampleSize: integer("min_sample_size").default(30).notNull(),
    observationDays: integer("observation_days").default(14).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgSlugUnique: uniqueIndex("growth_sectors_org_slug_uq").on(t.orgId, t.slug),
    orgIdx: index("growth_sectors_org_idx").on(t.orgId),
  }),
);

export const growthSectorEvidence = pgTable(
  "growth_sector_evidence",
  {
    id: id(),
    orgId: orgId(),
    sectorId: uuid("sector_id")
      .notNull()
      .references(() => growthSectors.id, { onDelete: "cascade" }),
    evidenceType: text("evidence_type").notNull(),
    prospectId: uuid("prospect_id").references(() => growthProspects.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => growthCampaigns.id, { onDelete: "set null" }),
    recipientId: uuid("recipient_id").references(() => growthCampaignRecipients.id, {
      onDelete: "set null",
    }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: ts(),
  },
  (t) => ({
    sectorIdx: index("growth_sector_evidence_sector_idx").on(t.orgId, t.sectorId, t.recordedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — Autopilot settings & allocation audit
// ────────────────────────────────────────────────────────────────────────────

export const growthAutopilotMode = pgEnum("growth_autopilot_mode", ["OBSERVE", "ASSISTED", "AUTOPILOT"]);

export const growthAutopilotSettings = pgTable(
  "growth_autopilot_settings",
  {
    id: id(),
    orgId: orgId(),
    mode: growthAutopilotMode("mode").default("OBSERVE").notNull(),
    /** Project-wide pause: blocks all campaign sends including queued follow-ups. */
    paused: boolean("paused").default(false).notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pausedBy: uuid("paused_by").references(() => users.id, { onDelete: "set null" }),
    dailySendCap: integer("daily_send_cap").default(50).notNull(),
    dailyBudgetCents: integer("daily_budget_cents").default(0).notNull(),
    /** Percent of daily capacity reserved for exploring new sectors (0–50). */
    explorationPercent: integer("exploration_percent").default(20).notNull(),
    approvedSectorIds: uuid("approved_sector_ids").array().default([]).notNull(),
    approvedSenderIds: uuid("approved_sender_ids").array().default([]).notNull(),
    lastCycleAt: timestamp("last_cycle_at", { withTimezone: true }),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgUnique: uniqueIndex("growth_autopilot_settings_org_uq").on(t.orgId),
  }),
);

export const growthAutopilotDecisions = pgTable(
  "growth_autopilot_decisions",
  {
    id: id(),
    orgId: orgId(),
    sectorId: uuid("sector_id").references(() => growthSectors.id, { onDelete: "set null" }),
    cycleId: uuid("cycle_id").notNull(),
    previousAllocation: integer("previous_allocation").notNull(),
    newAllocation: integer("new_allocation").notNull(),
    /** Plain-language explanation shown on Autopilot Decisions. */
    reasoning: text("reasoning").notNull(),
    inputs: jsonb("inputs").notNull(),
    rollbackOfId: uuid("rollback_of_id"),
    createdAt: ts(),
  },
  (t) => ({
    orgIdx: index("growth_autopilot_decisions_org_idx").on(t.orgId, t.createdAt),
    cycleIdx: index("growth_autopilot_decisions_cycle_idx").on(t.orgId, t.cycleId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — Unified inbox & AI-assisted replies
// ────────────────────────────────────────────────────────────────────────────

export const growthInboxThreads = pgTable(
  "growth_inbox_threads",
  {
    id: id(),
    orgId: orgId(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    contactDetailId: uuid("contact_detail_id").references(() => growthContactDetails.id, {
      onDelete: "set null",
    }),
    campaignId: uuid("campaign_id").references(() => growthCampaigns.id, { onDelete: "set null" }),
    senderIdentityId: uuid("sender_identity_id").references(() => growthSenderIdentities.id, {
      onDelete: "set null",
    }),
    subject: text("subject"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    needsHumanReply: boolean("needs_human_reply").default(false).notNull(),
    verificationRequestedAt: timestamp("verification_requested_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    orgIdx: index("growth_inbox_threads_org_idx").on(t.orgId, t.lastMessageAt),
    prospectIdx: index("growth_inbox_threads_prospect_idx").on(t.orgId, t.prospectId),
  }),
);

export const growthInboxMessages = pgTable(
  "growth_inbox_messages",
  {
    id: id(),
    orgId: orgId(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => growthInboxThreads.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    bodyText: text("body_text").notNull(),
    intent: text("intent"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    /** Links an outbound mirror row to the auditable send log. */
    outboundMessageId: uuid("outbound_message_id").references(() => growthOutboundMessages.id, {
      onDelete: "set null",
    }),
    /** Provider event id for inbound deduplication (unique per org when set). */
    inboundDedupeKey: text("inbound_dedupe_key"),
    createdAt: ts(),
  },
  (t) => ({
    threadIdx: index("growth_inbox_messages_thread_idx").on(t.threadId, t.createdAt),
    inboundDedupeUnique: uniqueIndex("growth_inbox_messages_inbound_dedupe_uq").on(
      t.orgId,
      t.inboundDedupeKey,
    ),
  }),
);

export const growthReplyDrafts = pgTable(
  "growth_reply_drafts",
  {
    id: id(),
    orgId: orgId(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => growthInboxThreads.id, { onDelete: "cascade" }),
    inboundMessageId: uuid("inbound_message_id").references(() => growthInboxMessages.id, {
      onDelete: "set null",
    }),
    language: text("language").default("EN").notNull(),
    draftText: text("draft_text").notNull(),
    contextSources: jsonb("context_sources").default([]).notNull(),
    knowledgeFactIds: uuid("knowledge_fact_ids").array().default([]).notNull(),
    requiresHuman: boolean("requires_human").default(false).notNull(),
    humanRouteReason: text("human_route_reason"),
    status: text("status").default("DRAFT").notNull(),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    threadIdx: index("growth_reply_drafts_thread_idx").on(t.threadId, t.createdAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stage 3 — Inbound webhook dedup + Stage 4 pipeline + Stage 5 import audit
// ────────────────────────────────────────────────────────────────────────────

export const growthInboundWebhookEvents = pgTable(
  "growth_inbound_webhook_events",
  {
    id: id(),
    orgId: orgId(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    status: text("status").default("PROCESSED").notNull(),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    dedupeUnique: uniqueIndex("growth_inbound_webhook_events_dedupe_uq").on(
      t.orgId,
      t.provider,
      t.externalId,
    ),
    orgIdx: index("growth_inbound_webhook_events_org_idx").on(t.orgId, t.receivedAt),
  }),
);

export const growthOpportunityStage = pgEnum("growth_opportunity_stage", [
  "LEAD",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "SITE_ASSESSMENT",
  "ESTIMATE_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
]);

export const growthMeetingStatus = pgEnum("growth_meeting_status", [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const growthOpportunities = pgTable(
  "growth_opportunities",
  {
    id: id(),
    orgId: orgId(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => growthInboxThreads.id, { onDelete: "set null" }),
    campaignId: uuid("campaign_id").references(() => growthCampaigns.id, { onDelete: "set null" }),
    recipientId: uuid("recipient_id").references(() => growthCampaignRecipients.id, {
      onDelete: "set null",
    }),
    stage: growthOpportunityStage("stage").default("LEAD").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    linkedCustomerId: uuid("linked_customer_id").references(() => customers.id, { onDelete: "set null" }),
    linkedJobId: uuid("linked_job_id"),
    linkedEstimateId: uuid("linked_estimate_id"),
    linkedServiceAgreementId: uuid("linked_service_agreement_id"),
    lostReason: text("lost_reason"),
    wonAt: timestamp("won_at", { withTimezone: true }),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgStageIdx: index("growth_opportunities_org_stage_idx").on(t.orgId, t.stage),
    prospectIdx: index("growth_opportunities_prospect_idx").on(t.orgId, t.prospectId),
  }),
);

export const growthMeetings = pgTable(
  "growth_meetings",
  {
    id: id(),
    orgId: orgId(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => growthOpportunities.id, { onDelete: "cascade" }),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => growthProspects.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    status: growthMeetingStatus("status").default("SCHEDULED").notNull(),
    notes: text("notes"),
    createdBy: createdBy(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index("growth_meetings_org_idx").on(t.orgId, t.scheduledAt),
    opportunityIdx: index("growth_meetings_opportunity_idx").on(t.opportunityId),
  }),
);

/** Read-only Explee import runs — audit only; no write-back to Explee. */
export const growthProspectDiscoveryRuns = pgTable(
  "growth_prospect_discovery_runs",
  {
    id: id(),
    orgId: orgId(),
    sectorSlug: text("sector_slug"),
    city: text("city"),
    country: text("country"),
    status: text("status").notNull(),
    prospectsSeen: integer("prospects_seen").default(0).notNull(),
    prospectsCreated: integer("prospects_created").default(0).notNull(),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: createdBy(),
  },
  (t) => ({
    orgIdx: index("growth_prospect_discovery_runs_org_idx").on(t.orgId, t.startedAt),
  }),
);

export const growthInboxThreadNotes = pgTable(
  "growth_inbox_thread_notes",
  {
    id: id(),
    orgId: orgId(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => growthInboxThreads.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    threadIdx: index("growth_inbox_thread_notes_thread_idx").on(t.threadId, t.createdAt),
  }),
);

export const growthAutopilotSimulationRuns = pgTable(
  "growth_autopilot_simulation_runs",
  {
    id: id(),
    orgId: orgId(),
    inputs: jsonb("inputs").notNull(),
    outputs: jsonb("outputs").notNull(),
    summary: text("summary").notNull(),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    orgIdx: index("growth_autopilot_simulation_runs_org_idx").on(t.orgId, t.createdAt),
  }),
);

export const growthCampaignAuditLog = pgTable(
  "growth_campaign_audit_log",
  {
    id: id(),
    orgId: orgId(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => growthCampaigns.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    note: text("note"),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    campaignIdx: index("growth_campaign_audit_log_campaign_idx").on(t.campaignId, t.changedAt),
  }),
);

export const growthExpleeImportRuns = pgTable(
  "growth_explee_import_runs",
  {
    id: id(),
    orgId: orgId(),
    status: text("status").notNull(),
    rowsSeen: integer("rows_seen").default(0).notNull(),
    rowsImported: integer("rows_imported").default(0).notNull(),
    rowsSkipped: integer("rows_skipped").default(0).notNull(),
    previewOnly: boolean("preview_only").default(true).notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: createdBy(),
  },
  (t) => ({
    orgIdx: index("growth_explee_import_runs_org_idx").on(t.orgId, t.startedAt),
  }),
);

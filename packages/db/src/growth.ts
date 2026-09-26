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
    timezone: text("timezone").default("UTC").notNull(),
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
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
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
    status: growthOutboundStatus("status").default("QUEUED").notNull(),
    providerMessageId: text("provider_message_id"),
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

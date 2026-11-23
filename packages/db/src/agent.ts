import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AgentLanguage, AgentUrgency, JobDraft } from "@nnact/shared";
import { customers, jobs } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull();
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const conversationChannel = pgEnum("conversation_channel", ["whatsapp"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const conversationState = pgEnum("conversation_state", [
  "open",
  "awaiting_customer",
  "needs_choice",
  "needs_template",
  "closed",
]);
export const agentRunState = pgEnum("agent_run_state", ["pending", "running", "completed", "failed", "skipped"]);

/** One encrypted WhatsApp Business Cloud API credential set per organization. */
export const whatsappConfigs = pgTable(
  "whatsapp_configs",
  {
    id: id(),
    orgId: orgId(),
    phoneNumberId: text("phone_number_id").notNull(),
    businessAccountId: text("business_account_id"),
    /** AES-256-GCM ciphertext, encrypted with CONTENT_PUBLISHING_KEY. */
    accessTokenCipher: text("access_token_cipher").notNull(),
    appSecretCipher: text("app_secret_cipher").notNull(),
    verifyTokenCipher: text("verify_token_cipher").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    mediaRetentionDays: integer("media_retention_days").default(30).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({ org: uniqueIndex("whatsapp_configs_org_idx").on(t.orgId) }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    orgId: orgId(),
    channel: conversationChannel("channel").default("whatsapp").notNull(),
    /** WhatsApp sender phone in normalized digits — the stable customer identity for intake. */
    externalId: text("external_id").notNull(),
    participantPhone: text("participant_phone").notNull(),
    displayName: text("display_name"),
    language: text("language").default("en").notNull(),
    state: conversationState("state").default("open").notNull(),
    /** Set when exactly one customer record matches the normalized phone. */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    followUpCount: integer("follow_up_count").default(0).notNull(),
    needsTemplate: boolean("needs_template").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgExternal: uniqueIndex("conversations_org_external_idx").on(t.orgId, t.channel, t.externalId),
    orgPhone: index("conversations_org_phone_idx").on(t.orgId, t.participantPhone),
    orgLastMessage: index("conversations_org_last_message_idx").on(t.orgId, t.lastMessageAt),
  }),
);

export interface AgentMessageMediaRef {
  id: string;
  kind: "image" | "audio";
  contentType: string;
  fileName: string | null;
  waMediaId: string | null;
}

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Meta WhatsApp message id (wamid.*); unique so retries are idempotent. */
    externalId: text("external_id"),
    direction: messageDirection("direction").notNull(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    text: text("text"),
    /** Voice-note transcript. Original audio is retained in agent_media. */
    transcript: text("transcript"),
    language: text("language"),
    safetyFlags: jsonb("safety_flags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    media: jsonb("media").$type<AgentMessageMediaRef[]>().default(sql`'[]'::jsonb`).notNull(),
    followUpIndex: integer("follow_up_index"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    external: uniqueIndex("messages_org_external_idx").on(t.orgId, t.externalId),
    conversation: index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    sender: index("messages_org_sender_created_idx").on(t.orgId, t.fromAddress, t.createdAt),
  }),
);

/** Downloaded WhatsApp media in private storage, with retention until attached to a job. */
export const agentMedia = pgTable(
  "agent_media",
  {
    id: id(),
    orgId: orgId(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name"),
    byteSize: integer("byte_size").notNull(),
    waMediaId: text("wa_media_id"),
    sha256: text("sha256"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    job: index("agent_media_job_idx").on(t.jobId),
    expiry: index("agent_media_expiry_idx").on(t.expiresAt),
    message: index("agent_media_message_idx").on(t.messageId),
  }),
);

export interface AgentRunIO {
  draft?: JobDraft;
  prompt?: string;
  transcript?: string;
  [key: string]: unknown;
}

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    orgId: orgId(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    state: agentRunState("state").default("pending").notNull(),
    task: text("task").notNull(),
    input: jsonb("input").$type<AgentRunIO>().notNull(),
    output: jsonb("output").$type<AgentRunIO>(),
    provider: text("provider"),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    costCents: integer("cost_cents").default(0).notNull(),
    error: text("error"),
    attempts: integer("attempts").default(0).notNull(),
    agentId: text("agent_id"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    outcome: text("outcome"),
    leaseId: uuid("lease_id"),
    createdAt: ts(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    orgTask: index("agent_runs_org_task_created_idx").on(t.orgId, t.task, t.createdAt),
    conversation: index("agent_runs_conversation_idx").on(t.conversationId, t.createdAt),
  }),
);

export const agentLeases = pgTable(
  "agent_leases",
  {
    id: id(),
    agentId: text("agent_id").notNull(),
    orgId: uuid("org_id"),
    leaseKey: text("lease_key").notNull(),
    state: text("state").default("leased").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    agentKey: uniqueIndex("agent_leases_agent_key_idx").on(t.agentId, t.leaseKey),
    expiry: index("agent_leases_expiry_idx").on(t.expiresAt),
    agentState: index("agent_leases_agent_state_idx").on(t.agentId, t.state),
  }),
);

export const agentDeadLetters = pgTable(
  "agent_dead_letters",
  {
    id: id(),
    agentId: text("agent_id").notNull(),
    orgId: uuid("org_id"),
    leaseKey: text("lease_key"),
    runId: uuid("run_id"),
    task: text("task").notNull(),
    error: text("error").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: ts(),
  },
  (t) => ({
    agentCreated: index("agent_dead_letters_agent_created_idx").on(t.agentId, t.createdAt),
    taskCreated: index("agent_dead_letters_task_created_idx").on(t.task, t.createdAt),
  }),
);

export type WhatsAppConfig = typeof whatsappConfigs.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type AgentMessage = typeof messages.$inferSelect;
export type AgentMedia = typeof agentMedia.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentLease = typeof agentLeases.$inferSelect;
export type AgentDeadLetter = typeof agentDeadLetters.$inferSelect;
export type AgentLanguageCode = AgentLanguage;
export type AgentUrgencyCode = AgentUrgency;

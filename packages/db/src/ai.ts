// AI content automation schema — provider configs, automation settings,
// generation runs, usage metering, and the evergreen content reserve.
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { orgs } from "./schema.js";
import { contentItems, contentMedia } from "./content.js";

export const aiProviderEnum = pgEnum("ai_provider", ["OPENAI", "CLAUDE", "GROK"]);
export const aiProviderStatusEnum = pgEnum("ai_provider_status", ["CONNECTED", "DISCONNECTED", "INVALID", "DEGRADED"]);
export const aiSlotEnum = pgEnum("ai_slot", ["MORNING", "EVENING"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: id(),
    orgId: orgId(),
    provider: aiProviderEnum("provider"),
    enabled: boolean("enabled").default(false),
    status: aiProviderStatusEnum("status").default("DISCONNECTED"),
    apiKeyCipher: text("api_key_cipher"),
    defaultTextModel: text("default_text_model"),
    defaultImageModel: text("default_image_model"),
    baseUrl: text("base_url"),
    timeoutMs: integer("timeout_ms").default(30_000),
    priority: integer("priority").default(100),
    capabilities: jsonb("capabilities").$type<Record<string, boolean | number>>().default({}).notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().default({}).notNull(),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at"),
    lastSuccessAt: timestamp("last_success_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("ai_provider_configs_org_idx").on(t.orgId)],
);

export const aiContentAutomation = pgTable(
  "ai_content_automation",
  {
    orgId: orgId().primaryKey(),
    enabled: boolean("enabled").default(false),
    mode: text("mode").default("AUTO_PUBLISH_WITH_GUARDRAILS"),
    timezone: text("timezone").default("Africa/Douala"),
    morningTime: text("morning_time").default("08:00"),
    eveningTime: text("evening_time").default("18:00"),
    enabledDays: text("enabled_days").array().default(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    channels: text("channels").array().default(["WEBSITE", "LINKEDIN"]),
    textProviderOrder: text("text_provider_order").array().default(["CLAUDE", "OPENAI", "GROK"]),
    imageProvider: text("image_provider"),
    reviewProvider: text("review_provider"),
    reserveEnabled: boolean("reserve_enabled").default(true),
    reserveTarget: integer("reserve_target").default(4),
    qualityThreshold: integer("quality_threshold").default(80),
    catchUpWindowMinutes: integer("catch_up_window_minutes").default(180),
    maxRetries: integer("max_retries").default(2),
    maxImagesPerSlot: integer("max_images_per_slot").default(2),
    maxAiCallsPerSlot: integer("max_ai_calls_per_slot").default(24),
    dailyBudgetCents: integer("daily_budget_cents").default(10_000),
    monthlyBudgetCents: integer("monthly_budget_cents").default(250_000),
    lastMorningRunAt: timestamp("last_morning_run_at"),
    lastEveningRunAt: timestamp("last_evening_run_at"),
    lastDigestSentAt: timestamp("last_digest_sent_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("ai_automation_org_idx").on(t.orgId)],
);

export const aiGenerationRuns = pgTable(
  "ai_generation_runs",
  {
    id: id(),
    orgId: orgId(),
    slotKey: text("slot_key").unique().notNull(),
    slot: aiSlotEnum("slot"),
    scheduledDate: date("scheduled_date"),
    state: text("state").default("SCHEDULED"),
    brief: jsonb("brief").$type<Record<string, unknown>>().default({}),
    topic: text("topic"),
    angle: text("angle"),
    categoryId: text("category_id"),
    categoryName: text("category_name"),
    contentType: text("content_type"),
    contentId: uuid("content_id").references(() => contentItems.id),
    aiMetadata: jsonb("ai_metadata").$type<Record<string, unknown>>().default({}),
    writerProvider: text("writer_provider"),
    reviewProvider: text("review_provider"),
    imageProvider: text("image_provider"),
    quality: jsonb("quality").$type<Record<string, unknown>>(),
    imageSourceType: text("image_source_type"),
    canonicalUrl: text("canonical_url"),
    websitePublishedAt: timestamp("website_published_at"),
    linkedinPublishedAt: timestamp("linkedin_published_at"),
    reserveUsed: boolean("reserve_used").default(false),
    attempts: integer("attempts").default(0),
    error: text("error"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("ai_runs_org_idx").on(t.orgId),
    index("ai_runs_state_idx").on(t.state),
    index("ai_runs_slotdate_idx").on(t.scheduledDate),
  ],
);

export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: id(),
    orgId: orgId(),
    runId: uuid("run_id"),
    task: text("task"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    imageCount: integer("image_count").default(0),
    latencyMs: integer("latency_ms").default(0),
    costCents: integer("cost_cents").default(0),
    createdAt: timestamp("created_at"),
  },
  (t) => [index("ai_usage_org_time_idx").on(t.orgId, t.createdAt)],
);

export const aiReserveItems = pgTable(
  "ai_reserve_items",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id").references(() => contentItems.id),
    topic: text("topic"),
    categoryId: text("category_id"),
    categoryName: text("category_name"),
    status: text("status").default("READY"),
    usedAt: timestamp("used_at"),
    slotKeyUsed: text("slot_key_used"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("ai_reserve_org_status_idx").on(t.orgId, t.status)],
);

export const aiPromptTemplates = pgTable(
  "ai_prompt_templates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name"),
    version: text("version"),
    template: text("template"),
    active: boolean("active").default(true),
    updatedAt: timestamp("updated_at"),
    createdAt: timestamp("created_at"),
  },
  (t) => [index("ai_prompt_templates_org_name_idx").on(t.orgId, t.name)],
);
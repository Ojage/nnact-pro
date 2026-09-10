// AI infra — DB-backed repositories for provider configs (keys encrypted at
// rest), automation settings (auto-seeded defaults), generation runs, usage
// metering, the reserve pool, and prompt templates. These are the only concrete
// ports in the AI context that touch the database.
import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  aiContentAutomation,
  aiGenerationRuns,
  aiPromptTemplates,
  aiProviderConfigs,
  aiReserveItems,
  aiUsageRecords,
} from "@nnact/db";
import type {
  AiAutomationSettingsDTO,
  AiProviderConfigDTO,
  AiProviderConfigWrite,
  AiProviderId,
  AiProviderStatus,
  AiRunDTO,
  AiRunState,
  AiSlot,
  AiUsageSummaryDTO,
} from "@nnact/shared";
import { decryptSecret, encryptSecret } from "../publishing/infra/encryption.js";
import { slotKey } from "./domain.js";
import type { SlotSchedule } from "./domain.js";
import type {
  AiAutomationSettingsPort,
  AiPromptTemplateStorePort,
  AiProviderConfigStorePort,
  AiReserveStorePort,
  AiRunListQuery,
  AiRunStorePort,
  AiUsageStorePort,
  ReserveItemDTO,
} from "./ports.js";

function iso(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined;
  return typeof v === "string" ? v : v.toISOString();
}

function killSwitchActive(): boolean {
  return process.env.AI_AUTOPUBLISH_DISABLED === "true";
}

// ── Provider configs ───────────────────────────────────────────────────────
const DEFAULT_CAPABILITIES = { textGeneration: true, structuredOutput: true, visionInput: true, imageGeneration: false, imageEditing: false, embeddings: false, toolUse: false, maxContextTokens: 128_000 };

function toConfigDTO(row: typeof aiProviderConfigs.$inferSelect): AiProviderConfigDTO {
  const caps = { ...DEFAULT_CAPABILITIES, ...((row.capabilities ?? {}) as Partial<Record<string, unknown>>), imageGeneration: row.provider === "OPENAI" };
  return {
    provider: row.provider as AiProviderId,
    enabled: row.enabled ?? false,
    status: row.status as AiProviderStatus,
    capabilities: caps as unknown as AiProviderConfigDTO["capabilities"],
    defaultTextModel: row.defaultTextModel,
    defaultImageModel: row.defaultImageModel,
    timeoutMs: row.timeoutMs ?? 30_000,
    priority: row.priority ?? 100,
    lastError: row.lastError,
    lastCheckedAt: iso(row.lastCheckedAt) ?? null,
    options: (row.options ?? {}) as Record<string, unknown>,
  };
}

export class DbProviderConfigStore implements AiProviderConfigStorePort {
  async list(orgId: string): Promise<AiProviderConfigDTO[]> {
    const rows = await db.select().from(aiProviderConfigs).where(eq(aiProviderConfigs.orgId, orgId)).orderBy(asc(aiProviderConfigs.priority));
    return rows.map(toConfigDTO);
  }

  async getConfig(orgId: string, provider: AiProviderId): Promise<AiProviderConfigDTO | null> {
    const [row] = await db.select().from(aiProviderConfigs).where(and(eq(aiProviderConfigs.orgId, orgId), eq(aiProviderConfigs.provider, provider as never))).limit(1);
    return row ? toConfigDTO(row) : null;
  }

  async getDecrypted(orgId: string, provider: AiProviderId): Promise<DecryptedConfig | null> {
    const [row] = await db.select().from(aiProviderConfigs).where(and(eq(aiProviderConfigs.orgId, orgId), eq(aiProviderConfigs.provider, provider as never))).limit(1);
    if (!row || !row.enabled || !row.apiKeyCipher) return null;
    const apiKey = decryptSecret(row.apiKeyCipher);
    if (!apiKey) return null;
    return {
      provider,
      apiKey,
      baseUrl: row.baseUrl ?? null,
      timeoutMs: row.timeoutMs ?? 30_000,
      defaultTextModel: row.defaultTextModel,
      defaultImageModel: row.defaultImageModel,
      options: (row.options ?? {}) as Record<string, unknown>,
    };
  }

  async upsert(orgId: string, provider: AiProviderId, input: AiProviderConfigWrite): Promise<AiProviderConfigDTO> {
    const existing = await this.list(orgId).then((rows) => rows.find((r) => r.provider === provider));
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.defaultTextModel !== undefined) updates.defaultTextModel = input.defaultTextModel;
    if (input.defaultImageModel !== undefined) updates.defaultImageModel = input.defaultImageModel;
    if (input.timeoutMs !== undefined) updates.timeoutMs = input.timeoutMs;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.options !== undefined) updates.options = input.options;
    if (input.apiKey !== undefined && input.apiKey !== null && input.apiKey !== "") updates.apiKeyCipher = encryptSecret(input.apiKey);
    if (input.apiKey === null) updates.apiKeyCipher = null;

    if (!existing) {
      updates.orgId = orgId;
      updates.provider = provider;
      updates.status = "DISCONNECTED";
      updates.capabilities = { ...DEFAULT_CAPABILITIES, imageGeneration: provider === "OPENAI" };
      updates.createdAt = new Date();
      await db.insert(aiProviderConfigs).values(updates as never);
    } else {
      await db.update(aiProviderConfigs).set(updates as never).where(and(eq(aiProviderConfigs.orgId, orgId), eq(aiProviderConfigs.provider, provider as never)));
    }
    return (await this.getConfig(orgId, provider))!;
  }

  async setStatus(orgId: string, provider: AiProviderId, status: AiProviderStatus, lastError?: string | null): Promise<void> {
    const last = lastError ?? null;
    await db.update(aiProviderConfigs).set({ status: status as never, lastError: last, lastCheckedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiProviderConfigs.orgId, orgId), eq(aiProviderConfigs.provider, provider as never)));
  }
}

type DecryptedConfig = {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string | null;
  timeoutMs: number;
  defaultTextModel: string | null;
  defaultImageModel: string | null;
  options: Record<string, unknown>;
};

// ── Automation settings ────────────────────────────────────────────────────
const SETTINGS_DEFAULTS = {
  enabled: false,
  mode: "AUTO_PUBLISH_WITH_GUARDRAILS",
  timezone: "Africa/Douala",
  morningTime: "08:00",
  eveningTime: "18:00",
  enabledDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  channels: ["WEBSITE", "LINKEDIN"],
  textProviderOrder: ["CLAUDE", "OPENAI", "GROK"],
  imageProvider: "OPENAI",
  reviewProvider: "CLAUDE",
  reserveEnabled: true,
  reserveTarget: 4,
  qualityThreshold: 80,
  catchUpWindowMinutes: 180,
  maxRetries: 2,
  maxImagesPerSlot: 2,
  maxAiCallsPerSlot: 24,
  dailyBudgetCents: 10_000,
  monthlyBudgetCents: 250_000,
};

function toSettingsDTO(row: typeof aiContentAutomation.$inferSelect): AiAutomationSettingsDTO {
  return {
    orgId: row.orgId,
    enabled: row.enabled ?? false,
    mode: (row.mode as AiAutomationSettingsDTO["mode"]) ?? "AUTO_PUBLISH_WITH_GUARDRAILS",
    timezone: row.timezone ?? "Africa/Douala",
    morningTime: row.morningTime ?? "08:00",
    eveningTime: row.eveningTime ?? "18:00",
    enabledDays: (row.enabledDays as string[]) ?? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
    channels: (row.channels as string[]) ?? ["WEBSITE", "LINKEDIN"],
    textProviderOrder: (row.textProviderOrder as AiProviderId[]) ?? ["CLAUDE", "OPENAI", "GROK"],
    imageProvider: (row.imageProvider as AiProviderId) ?? null,
    reviewProvider: (row.reviewProvider as AiProviderId) ?? null,
    reserveEnabled: row.reserveEnabled ?? true,
    reserveTarget: row.reserveTarget ?? 4,
    qualityThreshold: row.qualityThreshold ?? 80,
    catchUpWindowMinutes: row.catchUpWindowMinutes ?? 180,
    maxRetries: row.maxRetries ?? 2,
    maxImagesPerSlot: row.maxImagesPerSlot ?? 2,
    maxAiCallsPerSlot: row.maxAiCallsPerSlot ?? 24,
    dailyBudgetCents: row.dailyBudgetCents ?? 10_000,
    monthlyBudgetCents: row.monthlyBudgetCents ?? 250_000,
    lastMorningRunAt: iso(row.lastMorningRunAt) ?? null,
    lastEveningRunAt: iso(row.lastEveningRunAt) ?? null,
    lastDigestSentAt: iso(row.lastDigestSentAt) ?? null,
    nextMorningRunAt: null, // computed by the runtime health reporter
    nextEveningRunAt: null, // computed by the runtime health reporter
    killSwitch: killSwitchActive(),
  };
}

export class DbAutomationSettingsStore implements AiAutomationSettingsPort {
  async get(orgId: string): Promise<AiAutomationSettingsDTO> {
    const [row] = await db.select().from(aiContentAutomation).where(eq(aiContentAutomation.orgId, orgId)).limit(1);
    if (!row) {
      await db.transaction(async (tx) => {
        await tx.insert(aiContentAutomation).values({ orgId, ...SETTINGS_DEFAULTS, updatedAt: new Date() } as never).onConflictDoNothing();
      });
      const [seed] = await db.select().from(aiContentAutomation).where(eq(aiContentAutomation.orgId, orgId)).limit(1);
      return toSettingsDTO(seed);
    }
    return toSettingsDTO(row);
  }

  async save(orgId: string, patch: Partial<AiAutomationSettingsDTO>): Promise<AiAutomationSettingsDTO> {
    const allowed = new Set([
      "enabled", "mode", "timezone", "morningTime", "eveningTime", "enabledDays", "channels",
      "textProviderOrder", "imageProvider", "reviewProvider", "reserveEnabled", "reserveTarget",
      "qualityThreshold", "catchUpWindowMinutes", "maxRetries", "maxImagesPerSlot",
      "maxAiCallsPerSlot", "dailyBudgetCents", "monthlyBudgetCents",
    ]);
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "orgId" || key === "killSwitch" || key === "nextMorningRunAt" || key === "nextEveningRunAt" || key === "_computedAt" || value === undefined) continue;
      if (allowed.has(key) && value !== null) changes[key] = value;
      if (allowed.has(key) && key === "imageProvider") changes[key] = value ?? null;
      if (allowed.has(key) && key === "reviewProvider") changes[key] = value ?? null;
    }
    await db.insert(aiContentAutomation).values({ orgId, ...SETTINGS_DEFAULTS, ...changes } as never).onConflictDoUpdate({ target: aiContentAutomation.orgId, set: changes as never });
    return this.get(orgId);
  }

  killSwitchActive(): boolean {
    return killSwitchActive();
  }
}

// ── Generation runs ────────────────────────────────────────────────────────
function toRunDTO(row: typeof aiGenerationRuns.$inferSelect): AiRunDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    slotKey: row.slotKey,
    slot: row.slot as AiSlot,
    scheduledDate: typeof row.scheduledDate === "string" ? row.scheduledDate : iso(row.scheduledDate)?.slice(0, 10) ?? "",
    state: (row.state as AiRunState) ?? "SCHEDULED",
    topic: row.topic,
    angle: row.angle,
    categoryName: row.categoryName,
    contentType: row.contentType,
    contentId: row.contentId ? String(row.contentId) : null,
    canonicalUrl: row.canonicalUrl,
    websitePublished: Boolean(row.websitePublishedAt),
    linkedinPublished: Boolean(row.linkedinPublishedAt),
    writerProvider: row.writerProvider,
    reviewProvider: row.reviewProvider,
    imageProvider: row.imageProvider,
    imageSourceType: row.imageSourceType,
    quality: ((row.quality as unknown as Record<string, unknown>)?.overall as number) ?? null,
    reserveUsed: row.reserveUsed ?? false,
    error: row.error,
    attempts: row.attempts ?? 0,
    startedAt: iso(row.startedAt) ?? null,
    completedAt: iso(row.completedAt) ?? null,
    createdAt: iso(row.createdAt) ?? "",
    updatedAt: iso(row.updatedAt) ?? null,
  };
}

export class DbRunStore implements AiRunStorePort {
  async ensureRun(orgId: string, schedule: SlotSchedule): Promise<AiRunDTO> {
    const key = slotKey(orgId, schedule.isoDate, schedule.slot);
    const [existing] = await db.select().from(aiGenerationRuns).where(eq(aiGenerationRuns.slotKey, key)).limit(1);
    if (existing) return toRunDTO(existing);
    const [row] = await db
      .insert(aiGenerationRuns)
      .values({ orgId, slotKey: key, slot: schedule.slot, scheduledDate: schedule.isoDate, state: "SCHEDULED", createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const [again] = await db.select().from(aiGenerationRuns).where(eq(aiGenerationRuns.slotKey, key)).limit(1);
      return toRunDTO(again);
    }
    return toRunDTO(row);
  }

  async getRun(orgId: string, runId: string): Promise<AiRunDTO | null> {
    const [row] = await db.select().from(aiGenerationRuns).where(and(eq(aiGenerationRuns.orgId, orgId), eq(aiGenerationRuns.id, runId))).limit(1);
    return row ? toRunDTO(row) : null;
  }

  async getRunBySlotKey(orgId: string, slotKeyValue: string): Promise<AiRunDTO | null> {
    const [row] = await db.select().from(aiGenerationRuns).where(and(eq(aiGenerationRuns.orgId, orgId), eq(aiGenerationRuns.slotKey, slotKeyValue))).limit(1);
    return row ? toRunDTO(row) : null;
  }

  async updateRun(orgId: string, runId: string, patch: Partial<AiRunDTO>): Promise<AiRunDTO> {
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.state !== undefined) changes.state = patch.state;
    if (patch.topic !== undefined) changes.topic = patch.topic;
    if (patch.angle !== undefined) changes.angle = patch.angle;
    if (patch.categoryName !== undefined) changes.categoryName = patch.categoryName;
    if (patch.contentType !== undefined) changes.contentType = patch.contentType;
    if (patch.contentId !== undefined) changes.contentId = patch.contentId;
    if (patch.canonicalUrl !== undefined) changes.canonicalUrl = patch.canonicalUrl;
    if (patch.websitePublished !== undefined && patch.contentId) changes.websitePublishedAt = patch.websitePublished ? new Date() : null;
    if (patch.linkedinPublished !== undefined && patch.contentId) changes.linkedinPublishedAt = patch.linkedinPublished ? new Date() : null;
    if (patch.writerProvider !== undefined) changes.writerProvider = patch.writerProvider;
    if (patch.reviewProvider !== undefined) changes.reviewProvider = patch.reviewProvider;
    if (patch.imageProvider !== undefined) changes.imageProvider = patch.imageProvider;
    if (patch.imageSourceType !== undefined) changes.imageSourceType = patch.imageSourceType;
    if (patch.quality !== undefined) changes.quality = { overall: patch.quality };
    if (patch.reserveUsed !== undefined) changes.reserveUsed = patch.reserveUsed;
    if (patch.error !== undefined) changes.error = patch.error;
    if (patch.startedAt !== undefined) changes.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
    if (patch.completedAt !== undefined) changes.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
    await db.update(aiGenerationRuns).set(changes).where(and(eq(aiGenerationRuns.orgId, orgId), eq(aiGenerationRuns.id, runId)));
    return (await this.getRun(orgId, runId))!;
  }

  async claimRun(orgId: string, runId: string): Promise<boolean> {
    const [row] = await db
      .update(aiGenerationRuns)
      .set({ state: "PLANNING", startedAt: new Date(), attempts: sql`${aiGenerationRuns.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(aiGenerationRuns.orgId, orgId), eq(aiGenerationRuns.id, runId), or(eq(aiGenerationRuns.state, "SCHEDULED"), eq(aiGenerationRuns.state, "NEEDS_ATTENTION"), eq(aiGenerationRuns.state, "FAILED"))))
      .returning({ id: aiGenerationRuns.id });
    return Boolean(row);
  }

  async markAttempt(orgId: string, runId: string): Promise<void> {
    await db
      .update(aiGenerationRuns)
      .set({ state: "PLANNING", startedAt: new Date(), attempts: sql`${aiGenerationRuns.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(aiGenerationRuns.orgId, orgId), eq(aiGenerationRuns.id, runId)));
  }

  async listRuns(query: AiRunListQuery): Promise<{ items: AiRunDTO[]; total: number }> {
    const conditions = [eq(aiGenerationRuns.orgId, query.orgId)];
    if (query.state) conditions.push(eq(aiGenerationRuns.state, query.state));
    const where = and(...conditions);
    const rows = await db.select().from(aiGenerationRuns).where(where).orderBy(desc(aiGenerationRuns.scheduledDate), desc(aiGenerationRuns.createdAt)).limit(query.take).offset(query.skip);
    const [{ value: total }] = await db.select({ value: count() }).from(aiGenerationRuns).where(where);
    return { items: rows.map(toRunDTO), total: Number(total) };
  }

  async listScheduledRuns(orgId: string): Promise<AiRunDTO[]> {
    const rows = await db
      .select()
      .from(aiGenerationRuns)
      .where(and(eq(aiGenerationRuns.orgId, orgId), inArray(aiGenerationRuns.state, ["SCHEDULED", "NEEDS_ATTENTION", "FAILED"] as AiRunState[])))
      .orderBy(asc(aiGenerationRuns.scheduledDate));
    return rows.map(toRunDTO);
  }

  async recentRuns(orgId: string, since: Date): Promise<AiRunDTO[]> {
    const rows = await db.select().from(aiGenerationRuns).where(and(eq(aiGenerationRuns.orgId, orgId), gte(aiGenerationRuns.createdAt, since))).orderBy(desc(aiGenerationRuns.createdAt));
    return rows.map(toRunDTO);
  }
}

// ── Usage ──────────────────────────────────────────────────────────────────
export class DbUsageStore implements AiUsageStorePort {
  async record(orgId: string, input: Parameters<AiUsageStorePort["record"]>[1]): Promise<void> {
    await db.insert(aiUsageRecords).values({
      orgId,
      runId: input.runId ?? null,
      task: input.task,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      imageCount: input.imageCount ?? 0,
      latencyMs: input.latencyMs ?? 0,
      costCents: input.costCents ?? 0,
      createdAt: new Date(),
    });
  }

  async spendBetween(orgId: string, from: Date, to: Date): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`coalesce(sum(${aiUsageRecords.costCents}), 0)` })
      .from(aiUsageRecords)
      .where(and(eq(aiUsageRecords.orgId, orgId), gte(aiUsageRecords.createdAt, from), lte(aiUsageRecords.createdAt, to)));
    return Number(row?.value ?? 0);
  }

  async usageSummary(orgId: string, todayStart: Date, monthStart: Date): Promise<AiUsageSummaryDTO> {
    const rows = await db.select().from(aiUsageRecords).where(and(eq(aiUsageRecords.orgId, orgId), gte(aiUsageRecords.createdAt, monthStart)));
    const bucket = () => ({ calls: 0, inputTokens: 0, outputTokens: 0, images: 0, costCents: 0 });
    const today = bucket();
    const month = bucket();
    const byProvider: Record<string, ReturnType<typeof bucket>> = {};
    const add = (target: ReturnType<typeof bucket>, r: typeof aiUsageRecords.$inferSelect) => {
      target.calls += 1;
      target.inputTokens += r.inputTokens ?? 0;
      target.outputTokens += r.outputTokens ?? 0;
      target.images += r.imageCount ?? 0;
      target.costCents += r.costCents ?? 0;
    };
    for (const r of rows) {
      if (!r.createdAt) continue;
      add(month, r);
      if (r.createdAt.getTime() >= todayStart.getTime()) add(today, r);
      const providerKey = r.provider ?? "unknown";
      byProvider[providerKey] ??= bucket();
      add(byProvider[providerKey], r);
    }
    return { today, month, byProvider };
  }
}

// ── Reserve ────────────────────────────────────────────────────────────────
function toReserveDTO(row: typeof aiReserveItems.$inferSelect): ReserveItemDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    contentId: row.contentId ? String(row.contentId) : null,
    topic: row.topic ?? "",
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    status: row.status ?? "READY",
    createdAt: iso(row.createdAt) ?? "",
  };
}

export class DbReserveStore implements AiReserveStorePort {
  async countReady(orgId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(aiReserveItems)
      .where(and(eq(aiReserveItems.orgId, orgId), eq(aiReserveItems.status, "READY")));
    return Number(row?.value ?? 0);
  }

  async listReady(orgId: string, limit: number): Promise<ReserveItemDTO[]> {
    const rows = await db
      .select()
      .from(aiReserveItems)
      .where(and(eq(aiReserveItems.orgId, orgId), eq(aiReserveItems.status, "READY")))
      .orderBy(asc(aiReserveItems.createdAt))
      .limit(limit);
    return rows.map(toReserveDTO);
  }

  async add(orgId: string, items: { contentId: string; topic: string; categoryId?: string | null; categoryName?: string | null }[]): Promise<number> {
    if (items.length === 0) return 0;
    await db.insert(aiReserveItems).values(items.map((item) => ({ orgId, contentId: item.contentId, topic: item.topic, categoryId: item.categoryId ?? null, categoryName: item.categoryName ?? null, status: "READY", createdAt: new Date(), updatedAt: new Date() })));
    return items.length;
  }

  async consume(orgId: string, itemId: string, runId: string, slotKeyValue: string): Promise<boolean> {
    const [row] = await db
      .update(aiReserveItems)
      .set({ status: "USED", usedAt: new Date(), slotKeyUsed: slotKeyValue })
      .where(and(eq(aiReserveItems.orgId, orgId), eq(aiReserveItems.id, itemId), eq(aiReserveItems.status, "READY")))
      .returning({ id: aiReserveItems.id });
    return Boolean(row);
  }

  async recent(orgId: string, limit: number): Promise<ReserveItemDTO[]> {
    const rows = await db.select().from(aiReserveItems).where(eq(aiReserveItems.orgId, orgId)).orderBy(desc(aiReserveItems.createdAt)).limit(limit);
    return rows.map(toReserveDTO);
  }
}

// ── Prompt templates ───────────────────────────────────────────────────────
export class DbPromptTemplateStore implements AiPromptTemplateStorePort {
  async get(orgId: string, name: string): Promise<string | null> {
    const [row] = await db
      .select()
      .from(aiPromptTemplates)
      .where(and(eq(aiPromptTemplates.orgId, orgId), eq(aiPromptTemplates.name, name), eq(aiPromptTemplates.active, true)))
      .orderBy(desc(aiPromptTemplates.updatedAt))
      .limit(1);
    return row?.template ?? null;
  }

  async upsert(orgId: string, name: string, version: string, template: string): Promise<void> {
    await db.insert(aiPromptTemplates).values({ orgId, name, version, template, active: true, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
  }
}
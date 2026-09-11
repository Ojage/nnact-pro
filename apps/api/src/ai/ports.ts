// AI ports — the automation application layer depends only on these interfaces.
// Concrete adapters (HTTP to OpenAI/Anthropic/xAI) live in adapters.ts, DB-backed
// repositories in infra.ts, and the registry wires them together. Adding a new
// provider means implementing TextProviderPort (+ optionally Image/Vision) and
// registering it — application code never branches on provider names.
import type {
  AiAutomationSettingsDTO,
  AiHealthDTO,
  AiProviderConfigDTO,
  AiProviderConfigWrite,
  AiProviderId,
  AiProviderStatus,
  AiRunDTO,
  AiRunState,
  AiSlot,
  AiUsageSummaryDTO,
  AiUsageAnalyticsDTO,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageQualityAssessmentDTO,
  QualityAssessmentDTO,
  TextGenerationRequest,
  TextGenerationResult,
  VisionAnalysisRequest,
  VisionAnalysisResult,
  WeeklyDigestDTO,
} from "@nnact/shared";
import type { DecryptedProviderConfig, SlotSchedule } from "./domain.js";

/** Text completion provider (OpenAI/Anthropic-compatible or Grok). */
export interface TextProviderPort {
  readonly provider: AiProviderId;
  generateText(request: TextGenerationRequest, config: DecryptedProviderConfig): Promise<TextGenerationResult>;
}

/** Image generation provider (OpenAI is the only one today). */
export interface ImageProviderPort {
  readonly provider: AiProviderId;
  generateImage(request: ImageGenerationRequest, config: DecryptedProviderConfig): Promise<ImageGenerationResult>;
}

/** Image understanding / review. */
export interface VisionProviderPort {
  readonly provider: AiProviderId;
  analyzeImage(request: VisionAnalysisRequest, config: DecryptedProviderConfig): Promise<VisionAnalysisResult>;
}

export interface AiProviderProbeResult {
  provider: AiProviderId;
  status: AiProviderStatus;
  lastError: string | null;
  latencyMs: number;
}

/** Adapter factory token — registry builds adapters lazily from configs. */
export interface AiAdapterFactory {
  probe(config: DecryptedProviderConfig): Promise<AiProviderProbeResult>;
  text(): TextProviderPort;
  image(): ImageProviderPort | null;
  vision(): VisionProviderPort;
}

/** Store of per-org provider configs (API keys encrypted at rest). */
export interface AiProviderConfigStorePort {
  list(orgId: string): Promise<AiProviderConfigDTO[]>;
  getConfig(orgId: string, provider: AiProviderId): Promise<AiProviderConfigDTO | null>;
  /** Decrypted config for live calls; null when disabled or never configured. */
  getDecrypted(orgId: string, provider: AiProviderId): Promise<DecryptedProviderConfig | null>;
  upsert(orgId: string, provider: AiProviderId, input: AiProviderConfigWrite): Promise<AiProviderConfigDTO>;
  setStatus(orgId: string, provider: AiProviderId, status: AiProviderStatus, lastError?: string | null): Promise<void>;
}

/** Shared automation settings (one row per org; default row auto-created). */
export interface AiAutomationSettingsPort {
  get(orgId: string): Promise<AiAutomationSettingsDTO>;
  save(orgId: string, patch: Partial<AiAutomationSettingsDTO>): Promise<AiAutomationSettingsDTO>;
  /** Global kill switch (env AI_AUTOPUBLISH_DISABLED=true) — halts all slots. */
  killSwitchActive(): boolean;
}

/** Evergreen reserve item (a pre-approved piece in the reserve pool). */
export interface ReserveItemDTO {
  id: string;
  orgId: string;
  contentId: string | null;
  topic: string;
  categoryId: string | null;
  categoryName: string | null;
  status: string;
  createdAt: string;
}

export interface AiRunListQuery {
  orgId: string;
  skip: number;
  take: number;
  state?: AiRunState;
}

/** Durable record of every slot attempt (idempotency via slot_key unique). */
export interface AiRunStorePort {
  ensureRun(orgId: string, schedule: SlotSchedule): Promise<AiRunDTO>;
  getRun(orgId: string, runId: string): Promise<AiRunDTO | null>;
  getRunBySlotKey(orgId: string, slotKey: string): Promise<AiRunDTO | null>;
  updateRun(orgId: string, runId: string, patch: Partial<AiRunDTO>): Promise<AiRunDTO>;
  /** Claim a run for execution; returns false if concurrently executing. */
  claimRun(orgId: string, runId: string): Promise<boolean>;
  /** Bump the attempt counter + reset to PLANNING for resumed runs. */
  markAttempt(orgId: string, runId: string): Promise<void>;
  listRuns(query: AiRunListQuery): Promise<{ items: AiRunDTO[]; total: number }>;
  listScheduledRuns(orgId: string): Promise<AiRunDTO[]>;
  recentRuns(orgId: string, since: Date): Promise<AiRunDTO[]>;
}

export interface AiUsageStorePort {
  record(orgId: string, input: {
    runId?: string | null;
    task: string;
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    latencyMs?: number;
    costCents?: number;
  }): Promise<void>;
  usageSummary(orgId: string, todayStart: Date, monthStart: Date): Promise<AiUsageSummaryDTO>;
  usageAnalytics(orgId: string, from: Date, to: Date): Promise<AiUsageAnalyticsDTO>;
  spendBetween(orgId: string, from: Date, to: Date): Promise<number>;
}

export interface AiReserveStorePort {
  countReady(orgId: string): Promise<number>;
  listReady(orgId: string, limit: number): Promise<ReserveItemDTO[]>;
  add(orgId: string, items: { contentId: string; topic: string; categoryId?: string | null; categoryName?: string | null }[]): Promise<number>;
  consume(orgId: string, itemId: string, runId: string, slotKey: string): Promise<boolean>;
  recent(orgId: string, limit: number): Promise<ReserveItemDTO[]>;
}

export interface AiPromptTemplateStorePort {
  get(orgId: string, name: string): Promise<string | null>;
  upsert(orgId: string, name: string, version: string, template: string): Promise<void>;
}

/** Quality screening. Implemented by a review provider or a deterministic fallback. */
export interface QualityAssessorPort {
  assess(orgId: string, input: { brief: unknown; title: string; body: string; hashtags: string[] }): Promise<QualityAssessmentDTO>;
  assessImage(orgId: string, prompt: string, image: { contentType: string; dataBase64: string }): Promise<ImageQualityAssessmentDTO>;
}

/** Puts a brand logo over generated imagery — sharp when available, else passthrough. */
export interface LogoCompositorPort {
  compose(input: { image: { contentType: string; dataBase64: string }; logoUrl: string | null; orgId: string }): Promise<{ contentType: string; dataBase64: string }>;
}

export interface NotificationsPort {
  inform(kind: "slot_succeeded" | "slot_failed" | "provider_failed" | "budget_alarm" | "weekly_digest" | "health_critical", payload: Record<string, unknown>): Promise<void>;
}

export interface AiHealthReport {
  health: AiHealthDTO;
  runStateDistribution: Record<AiRunState, number>;
  usage: AiUsageSummaryDTO;
  digest: WeeklyDigestDTO | null;
}

export interface AiAutomationRuntimePorts {
  configStore: AiProviderConfigStorePort;
  settings: AiAutomationSettingsPort;
  runs: AiRunStorePort;
  usage: AiUsageStorePort;
  reserve: AiReserveStorePort;
  templates: AiPromptTemplateStorePort;
  quality: QualityAssessorPort;
  compositor: LogoCompositorPort;
  notifications: NotificationsPort;
  now: () => Date;
}
// Autonomous AI content automation — shared domain types.
// These are deliberately thin DTOs: they cross the API boundary (admin UI) and
// the worker boundary (state machine). Provider SDK DTOs never appear here.

export const AI_PROVIDERS = ["OPENAI", "CLAUDE", "GROK"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_STATUSES = ["CONNECTED", "DISCONNECTED", "INVALID", "DEGRADED"] as const;
export type AiProviderStatus = (typeof AI_PROVIDER_STATUSES)[number];

export const AI_CAPABILITIES = [
  "textGeneration",
  "structuredOutput",
  "visionInput",
  "imageGeneration",
  "imageEditing",
  "embeddings",
  "toolUse",
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export interface AiProviderCapabilities {
  textGeneration: boolean;
  structuredOutput: boolean;
  visionInput: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  embeddings: boolean;
  toolUse: boolean;
  maxContextTokens: number;
}

export const AI_PROVIDER_CAPABILITIES: Record<AiProviderId, AiProviderCapabilities> = {
  OPENAI: {
    textGeneration: true,
    structuredOutput: true,
    visionInput: true,
    imageGeneration: true,
    imageEditing: true,
    embeddings: true,
    toolUse: false,
    maxContextTokens: 128_000,
  },
  CLAUDE: {
    textGeneration: true,
    structuredOutput: true,
    visionInput: true,
    imageGeneration: false,
    imageEditing: false,
    embeddings: false,
    toolUse: true,
    maxContextTokens: 200_000,
  },
  GROK: {
    textGeneration: true,
    structuredOutput: true,
    visionInput: true,
    imageGeneration: false,
    imageEditing: false,
    embeddings: true,
    toolUse: false,
    maxContextTokens: 131_072,
  },
};

/** Public provider configuration (never contains the API key). */
export interface AiProviderConfigDTO {
  provider: AiProviderId;
  enabled: boolean;
  status: AiProviderStatus;
  capabilities: AiProviderCapabilities;
  defaultTextModel: string | null;
  defaultImageModel: string | null;
  timeoutMs: number;
  priority: number;
  lastError: string | null;
  lastCheckedAt: string | null;
  options: Record<string, unknown>;
}

export interface AiProviderConfigWrite {
  enabled?: boolean;
  apiKey?: string | null;
  defaultTextModel?: string | null;
  defaultImageModel?: string | null;
  timeoutMs?: number;
  priority?: number;
  options?: Record<string, unknown>;
}

// ── Port DTOs (provider-normalized, SDK-free) ──────────────────────────────

export interface TextGenerationRequest {
  prompt: string;
  system?: string | null;
  /** Force valid JSON on the model output when the provider supports it. */
  structured?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Short task label for usage metering. */
  task?: string;
}

export interface TextGenerationResult {
  provider: AiProviderId;
  model: string;
  content: string;
  /** Parsed JSON when structured=true. */
  structuredData?: Record<string, unknown> | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  providerRequestId: string | null;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string | null;
  size: string; // "1024x1024"
  referenceAssetIds?: string[];
  task?: string;
}

export interface ImageGenerationResult {
  provider: AiProviderId;
  model: string;
  contentType: string; // image/png, image/jpeg, ...
  buffer: ArrayBuffer;
  bytes: number;
  width?: number | null;
  height?: number | null;
  latencyMs: number;
  providerRequestId: string | null;
}

export interface VisionAnalysisRequest {
  prompt: string;
  /** base64-encoded images. */
  images: { mediaType: string; dataBase64: string }[];
  task?: string;
}

export interface VisionAnalysisResult {
  provider: AiProviderId;
  model: string;
  verdict: "PASS" | "FAIL";
  score: number; // 0..100
  issues: string[];
  summary: string;
  latencyMs: number;
  providerRequestId: string | null;
}

// ── Automation domain ──────────────────────────────────────────────────────

export const AI_RUN_STATES = [
  "SCHEDULED",
  "PLANNING",
  "GENERATING_TEXT",
  "REVIEWING_TEXT",
  "SELECTING_MEDIA",
  "GENERATING_IMAGE",
  "REVIEWING_IMAGE",
  "CREATING_CONTENT",
  "PUBLISHING_WEBSITE",
  "PUBLISHING_LINKEDIN",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "NEEDS_ATTENTION",
  "FAILED",
] as const;
export type AiRunState = (typeof AI_RUN_STATES)[number];

export const AI_SLOTS = ["MORNING", "EVENING"] as const;
export type AiSlot = (typeof AI_SLOTS)[number];

export const AI_MODES = ["AUTO_PUBLISH_WITH_GUARDRAILS", "DRAFT_ONLY", "RESERVE_ONLY"] as const;
export type AiAutomationMode = (typeof AI_MODES)[number];

export const AI_IMAGE_STRATEGIES = ["USE_EXISTING", "ENHANCE_EXISTING", "GENERATE_NEW"] as const;
export type AiImageStrategy = (typeof AI_IMAGE_STRATEGIES)[number];

export interface ContentBriefDTO {
  topic: string;
  angle: string;
  audience: string;
  serviceCategory: string;
  contentType: "ARTICLE" | "MAINTENANCE_TIP" | "FIELD_STORY";
  primaryMessage: string;
  cta: string;
  desiredLength: number;
  imageDirection: string;
}

export interface QualityAssessmentDTO {
  relevance: number;
  clarity: number;
  brandVoice: number;
  factualSafety: number;
  technicalSafety: number;
  duplicationRisk: number;
  seoQuality: number;
  overall: number;
  blockingIssues: string[];
  publishDecision: "PUBLISH" | "REGENERATE" | "BLOCK";
}

export interface ImageQualityAssessmentDTO {
  verdict: "PASS" | "FAIL";
  score: number;
  issues: string[];
}

export interface AiAutomationSettingsDTO {
  orgId: string;
  enabled: boolean;
  mode: AiAutomationMode;
  timezone: string;
  morningTime: string;
  eveningTime: string;
  enabledDays: string[];
  channels: string[];
  textProviderOrder: AiProviderId[];
  imageProvider: AiProviderId | null;
  reviewProvider: AiProviderId | null;
  reserveEnabled: boolean;
  reserveTarget: number;
  qualityThreshold: number;
  catchUpWindowMinutes: number;
  maxRetries: number;
  maxImagesPerSlot: number;
  maxAiCallsPerSlot: number;
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  lastMorningRunAt: string | null;
  lastEveningRunAt: string | null;
  nextMorningRunAt: string | null;
  nextEveningRunAt: string | null;
  lastDigestSentAt: string | null;
  killSwitch: boolean;
}

export interface AiRunDTO {
  id: string;
  orgId: string;
  slotKey: string;
  slot: AiSlot;
  scheduledDate: string;
  state: AiRunState;
  topic: string | null;
  angle: string | null;
  categoryName: string | null;
  contentType: string | null;
  contentId: string | null;
  canonicalUrl: string | null;
  websitePublished: boolean;
  linkedinPublished: boolean;
  writerProvider: string | null;
  reviewProvider: string | null;
  imageProvider: string | null;
  imageSourceType: string | null;
  quality: number | null;
  reserveUsed: boolean;
  error: string | null;
  attempts: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AiUsageSummaryDTO {
  today: AiUsageBucketDTO;
  month: AiUsageBucketDTO;
  byProvider: Record<string, AiUsageBucketDTO>;
}

export interface AiUsageBucketDTO {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  costCents: number;
}

export interface AiHealthDTO {
  automation: "HEALTHY" | "DEGRADED" | "CRITICAL";
  automationEnabled: boolean;
  lastMorningRunAt: string | null;
  lastEveningRunAt: string | null;
  nextMorningRunAt: string | null;
  nextEveningRunAt: string | null;
  websiteHealthy: boolean;
  linkedInHealthy: boolean;
  queueHealthy: boolean;
  providers: Record<AiProviderId, AiProviderStatus>;
  reserveAvailable: number;
  reserveTarget: number;
}

export interface WeeklyDigestDTO {
  websitePublished: number;
  linkedinPublished: number;
  providerFallbacks: number;
  generatedImages: number;
  existingImagesUsed: number;
  blockedPosts: number;
  totalCostCents: number;
}
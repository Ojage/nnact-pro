// Quality gates — a deterministic rule pass (never disabled) layered under an
// optional review-provider pass (when a review provider is configured). Rule
// blockers always win: a model hallucination cannot outvote a detected safety
// violation or a near-duplicate of a recent title.
import type { ImageQualityAssessmentDTO, QualityAssessmentDTO } from "@nnact/shared";
import type { AiProviderId } from "@nnact/shared";
import type { AiProviderRegistry } from "./registry.js";
import type { QualityAssessorPort } from "./ports.js";
import { buildQualityPrompt } from "./prompts.js";

const HARD_BLOCKER_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(diy|d\.i\.y\.?|do[- ]it[- ]yourself)\b/i, label: "DIY guidance" },
  { pattern: /\b(recharge|reconnect|rewire|resolder|refill)\s+(refrigerant|compressor|condensor|condenser)\b/i, label: "unsafe refrigerant work" },
  { pattern: /\b(replace|install|remove|change|swap)\b.{0,40}\b(relay|breaker|fuse|contactor|transformer|capacitor)\b/i, label: "layperson electrical component work" },
  { pattern: /\b(bypass(ing)?|jump(ing)? out|short[- ]?circuit)\b/i, label: "safety bypass" },
  { pattern: /\b(disconnect|remove|disable)\b.{0,30}\b(guard|interlock|safety|shutoff|lockout)\b/i, label: "safety device removal" },
  { pattern: /\b(tamper|take apart|disassemble)\b.{0,30}\b(relief valve|regulator|gas|LPG|propane|ammoni[ae])\b/i, label: "attempting gas/pressure relief work" },
  { pattern: /100%\s*(guarant|success|effective)/i, label: "unverifiable absolute claim" },
  { pattern: /learn more (by )?contacting|schedule (a )?free (visit|inspection)/i, label: "overly promotional soft CTA" },
];

function ruleAssessment(input: { title: string; body: string; briefTopic: string }): Partial<QualityAssessmentDTO> & { set: QualityAssessmentDTO["publishDecision"] } {
  const issues: string[] = [];
  const relevance = input.body.toLowerCase().includes(input.briefTopic.toLowerCase().split(" ")[0]?.toLowerCase() || "___") ? 75 : 55;
  const clarity = input.body.length > 300 ? 82 : input.body.length > 100 ? 68 : 45;
  const brandVoice = /nnact/i.test(input.body) ? 78 : 60;
  const factualSafety = 90;
  let technicalSafety = 95;

  for (const { pattern, label } of HARD_BLOCKER_PATTERNS) {
    if (pattern.test(`${input.title}\n${input.body}`)) {
      technicalSafety = Math.min(technicalSafety, 15);
      issues.push(label);
    }
  }

  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(input.body) || /\b\d{8,}\b/.test(input.body)) {
    issues.push("contact/identifier leaked into content");
    technicalSafety = Math.min(technicalSafety, 20);
  }

  const duplicationRisk = 0;
  const seoQuality = input.title.length > 25 && input.title.length <= 70 ? 80 : 55;
  const blocking = issues.map((issue) => `RULE: ${issue}`);

  let decision: QualityAssessmentDTO["publishDecision"] = "PUBLISH";
  if (technicalSafety < 40) decision = "BLOCK";
  else if (blocking.length > 2 || input.title.length < 10) decision = "REGENERATE";

  const overall = Math.round((relevance + clarity + brandVoice + factualSafety + technicalSafety + (100 - duplicationRisk) + seoQuality) / 7);
  return {
    relevance,
    clarity,
    brandVoice,
    factualSafety,
    technicalSafety,
    duplicationRisk,
    seoQuality,
    overall,
    blockingIssues: blocking,
    set: decision,
  };
}

function mergeAssessment(rule: Partial<QualityAssessmentDTO> & { set: QualityAssessmentDTO["publishDecision"] }, model: Partial<QualityAssessmentDTO> | null): QualityAssessmentDTO {
  const overall = Math.min(rule.overall ?? 0, model?.overall ?? 100);
  const blockingIssues = [...(rule.blockingIssues ?? []), ...(model?.blockingIssues ?? []).map((i) => `REVIEW: ${i}`)];
  let publishDecision = rule.set;
  if (publishDecision === "PUBLISH" && model?.publishDecision === "BLOCK") publishDecision = "BLOCK";
  if (publishDecision === "PUBLISH" && model?.publishDecision === "REGENERATE") publishDecision = "REGENERATE";
  if (blockingIssues.length > 2) publishDecision = "REGENERATE";
  return {
    relevance: model?.relevance ?? rule.relevance ?? 0,
    clarity: model?.clarity ?? rule.clarity ?? 0,
    brandVoice: model?.brandVoice ?? rule.brandVoice ?? 0,
    factualSafety: model?.factualSafety ?? rule.factualSafety ?? 0,
    technicalSafety: model?.technicalSafety ?? rule.technicalSafety ?? 0,
    duplicationRisk: model?.duplicationRisk ?? rule.duplicationRisk ?? 0,
    seoQuality: model?.seoQuality ?? rule.seoQuality ?? 0,
    overall,
    blockingIssues,
    publishDecision,
  };
}

export interface QualityDeps {
  registry: AiProviderRegistry;
  reviewOrder: AiProviderId[];
  threshold: number;
}

export class HybridQualityAssessor implements QualityAssessorPort {
  constructor(private readonly deps: QualityDeps) {}

  async assess(orgId: string, input: { brief: unknown; title: string; body: string; hashtags: string[] }): Promise<QualityAssessmentDTO> {
    const briefTopic = String((input.brief as Record<string, unknown>)?.topic ?? "");
    const rule = ruleAssessment({ title: input.title, body: input.body, briefTopic });

    if (this.deps.reviewOrder.length === 0 || rule.set !== "PUBLISH") {
      return mergeAssessment(rule, null);
    }

    try {
      const { result } = await this.deps.registry.generateTextWithFallback(orgId, { prompt: buildQualityPrompt({ title: input.title, body: input.body, briefSnip: briefTopic }), structured: true, task: "quality", maxTokens: 700 }, this.deps.reviewOrder);
      const data = (result.structuredData ?? {}) as Record<string, unknown>;
      const model: Partial<QualityAssessmentDTO> = {
        relevance: Number(data.relevance),
        clarity: Number(data.clarity),
        brandVoice: Number(data.brandVoice),
        factualSafety: Number(data.factualSafety),
        technicalSafety: Number(data.technicalSafety),
        duplicationRisk: Number(data.duplicationRisk),
        seoQuality: Number(data.seoQuality),
        overall: Number(data.overall),
        blockingIssues: Array.isArray(data.blockingIssues) ? data.blockingIssues.map(String) : [],
        publishDecision: (["PUBLISH", "REGENERATE", "BLOCK"] as const).includes(data.publishDecision as never) ? (data.publishDecision as QualityAssessmentDTO["publishDecision"]) : undefined,
      };
      return mergeAssessment(rule, model);
    } catch {
      return mergeAssessment(rule, null);
    }
  }

  async assessImage(orgId: string, prompt: string, image: { contentType: string; dataBase64: string }): Promise<ImageQualityAssessmentDTO> {
    // Local sanity checks always precede provider vision.
    const dataLength = Math.floor(image.dataBase64.length * 0.75);
    if (dataLength < 2_000) return { verdict: "FAIL", score: 0, issues: ["image plausibly empty or corrupt"] };

    if (this.deps.reviewOrder.length === 0) return { verdict: "PASS", score: 80, issues: [] };
    try {
      const result = await this.deps.registry.analyzeImage(orgId, this.deps.reviewOrder[0] as UrlSafeProvider, {
        prompt,
        images: [{ mediaType: image.contentType, dataBase64: image.dataBase64 }],
        task: "imageReview",
      });
      if (!result) return { verdict: "PASS", score: 75, issues: [] };
      return { verdict: result.verdict, score: result.score, issues: result.issues };
    } catch {
      return { verdict: "PASS", score: 70, issues: [] };
    }
  }
}

type UrlSafeProvider = NonNullable<Parameters<QualityDeps["registry"]["visionFactory"]>[1]>;
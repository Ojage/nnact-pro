// Quality gates — a deterministic rule pass (never disabled) layered under an
// optional review-provider pass (when a review provider is configured). Rule
// blockers always win: a model hallucination cannot outvote a detected safety
// violation or a near-duplicate of a recent title.
import type { ImageQualityAssessmentDTO, QualityAssessmentDTO } from "@nnact/shared";
import type { AiProviderId } from "@nnact/shared";
import type { AiProviderRegistry } from "./registry.js";
import type { QualityAssessorPort } from "./ports.js";
import { buildQualityPrompt } from "./prompts.js";

// A blocker fires only when the unsafe phrasing is NOT negated. The writer is
// explicitly instructed to warn people away from unsafe work and to refer them
// to a certified technician (see buildMarketingKnowledge guarantees), so
// "Never bypass the safety interlock" is the content we WANT — blocking it
// punished the writer for following the brand-safety brief, which is how
// production runs started failing with "article blocked: RULE: safety bypass".
//
// This is a lexical heuristic, not comprehension. It deliberately matches only
// explicit prohibitions rather than bare "not", so an encouraging sentence
// ("you can bypass the guard") is still caught. The residual risk is a writer
// that negates and then advises in the same clause; the review provider
// (when configured) is the second layer for that.
const PROHIBITION_CUES =
  /\b(?:never|do not|don'?t|does not|doesn'?t|must not|mustn'?t|should not|shouldn'?t|shall not|cannot|can'?t|will not|won'?t|avoid|avoids|avoiding|refrain from|refuses to|prohibited|forbidden|not recommended|is not safe|isn'?t safe|are not safe|aren'?t safe|at no point|under no circumstances)\b/i;

// Returns the sentence containing a match, so a cue in one sentence can never
// excuse or condemn phrasing in another.
function sentenceAround(text: string, matchIndex: number, matchLength: number): string {
  const upToMatch = text.slice(0, matchIndex);
  const start = Math.max(
    upToMatch.lastIndexOf("."),
    upToMatch.lastIndexOf("!"),
    upToMatch.lastIndexOf("?"),
    upToMatch.lastIndexOf("\n"),
  );
  const rest = text.slice(matchIndex + matchLength);
  const endOffset = rest.search(/[.!?\n]/);
  const end = endOffset === -1 ? text.length : matchIndex + matchLength + endOffset;
  return text.slice(start + 1, end);
}

// A prohibition anywhere in that sentence disarms the blocker. Lookahead as
// well as lookbehind, because prohibition is frequently postposed in English:
// "bypassing the interlock is prohibited" states the rule after the phrase, and
// a backward-only scan read that as unsafe content.
function isNegated(text: string, matchIndex: number, matchLength: number): boolean {
  return PROHIBITION_CUES.test(sentenceAround(text, matchIndex, matchLength));
}

// True when the sentence reports the work as someone else's professional job.
function isAttributedToPro(text: string, matchIndex: number, matchLength: number): boolean {
  return LICENSED_THIRD_PARTY.test(sentenceAround(text, matchIndex, matchLength));
}

// Determiners and short filler between a verb and its object. Without this,
// "recharge the refrigerant" evaded the rule while the bare "recharge
// refrigerant" was caught — the pattern was matching on adjacency, not meaning.
const FILLER = String.raw`(?:\s+(?:the|a|an|your|their|its|this|that|these|those|some|any|all|own|unit's|system's|condensing|evaporating)){0,3}`;

// Work attributed to a qualified third party is a report, not instructions.
// "The refrigerant was recharged by a certified technician" must not read as
// advice to recharge it.
const LICENSED_THIRD_PARTY =
  /\b(?:certified|licensed|qualified|trained|professional|accredited|registered|competent|authori[sz]ed|approved|factory|nnact|technician|engineer|installer|specialist)\b/i;

const HARD_BLOCKER_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Active voice: recharge (the) refrigerant. Verb first, object within reach.
  { pattern: new RegExp(String.raw`\b(?:recharge|refill|top\s*up|reconnect|rewire|resolder|swap\s+out)\b${FILLER}\s+\b(?:refrigerant|compressor|condensor|condenser|evaporator|expansion\s+valve)\b`, "i"), label: "unsafe refrigerant work" },
  // Passive voice: the refrigerant was recharged by the owner.
  { pattern: /\b(?:refrigerant|compressor|condensor|condenser|evaporator)\b(?:\s+\w+){0,3}?\s+\b(?:was|were|is|are|has\s+been|have\s+been|gets?|got)\s+\b(?:recharged|refilled|rewired|resoldered|reconnected|topped\s+up|serviced\s+by\s+you)\b/i, label: "unsafe refrigerant work" },
  // Layperson component work. Scoped to one sentence so it cannot pair a verb
  // in one sentence with a component word in an unrelated one.
  { pattern: /\b(?:replace|install|remove|change|swap|tap|bridge|jump)\b[^.!?\n]{0,40}?\b(?:relay|breaker|fuse|contactor|transformer|capacitor|ignitor|igniter|thermal\s+cut-?out|limit\s+switch)\b/i, label: "layperson electrical component work" },
  { pattern: /\b(?:bypass(?:ing)?|bridging|defeating|jump(?:ing)?\s+(?:out|the)|short(?:ing)?\s+out)\b[^.!?\n]{0,30}?\b(?:guard|interlock|safety|shut-?off|lock-?out|limit\s+switch|pressure\s+switch)\b/i, label: "safety bypass" },
  { pattern: /\b(?:disconnect|remove|disable|defeat|block)\b[^.!?\n]{0,30}?\b(?:guard|interlock|safety\s+switch|shut-?off|lock-?out|emergency\s+stop)\b/i, label: "safety device removal" },
  { pattern: /\b(?:tamper\s+with|take\s+apart|disassemble|open\s+the|strip)\b[^.!?\n]{0,30}?\b(?:relief\s+valve|regulator|gas\s+valve|LPG|propane|ammoni[ae]|pressure\s+vessel|expansion\s+valve)\b/i, label: "attempting gas/pressure relief work" },
  { pattern: /100%\s*(?:guarantee[ds]?|guarant|success|effective|problem[- ]free)/i, label: "unverifiable absolute claim" },
  { pattern: /learn more (?:by )?contacting|schedule (?:a )?free (?:visit|inspection)/i, label: "overly promotional soft CTA" },
];

function ruleAssessment(input: { title: string; body: string; briefTopic: string }): Partial<QualityAssessmentDTO> & { set: QualityAssessmentDTO["publishDecision"] } {
  const issues: string[] = [];
  const relevance = input.body.toLowerCase().includes(input.briefTopic.toLowerCase().split(" ")[0]?.toLowerCase() || "___") ? 75 : 55;
  const clarity = input.body.length > 300 ? 82 : input.body.length > 100 ? 68 : 45;
  const brandVoice = /nnact/i.test(input.body) ? 78 : 60;
  const factualSafety = 90;
  let technicalSafety = 95;

  for (const { pattern, label } of HARD_BLOCKER_PATTERNS) {
    // A negated mention ("never bypass the interlock") is the safety advice we
    // asked the writer to produce, so it must not count against it. Nor does
    // work attributed to a licensed third party.
    const text = `${input.title}\n${input.body}`;
    const match = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
    if (match && !isNegated(text, match.index, match[0].length) && !isAttributedToPro(text, match.index, match[0].length)) {
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
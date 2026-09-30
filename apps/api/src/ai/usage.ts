// Usage metering helpers — window math plus cost-aware record construction.
// Budget guardrails compare today/month windows in UTC (the slots are Africa/
// Douala fixed +1, but budget windows are simply "last 24h wall days").
import type { AiProviderId } from "@nnact/shared";

export function windowStarts(now: Date = new Date()): { todayStart: Date; monthStart: Date; tomorrow: Date } {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const tomorrow = new Date(todayStart.getTime() + 86_400_000);
  return { todayStart, monthStart, tomorrow };
}

export interface UsageRecordDraft {
  orgId: string;
  provider: AiProviderId;
  model: string;
  task: string;
  runId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  latencyMs?: number;
  costCents: number;
}

/**
 * Input price in US dollars per million tokens, used as a rough budget proxy.
 *
 * These are indicative rates, not a billing integration — verify against each
 * provider's current price list before treating the usage figures as
 * accounting. The important property is that every provider call now reports a
 * non-zero cost: previously only the article write was priced and briefs,
 * quality reviews, image briefs, image generation and vision review all
 * recorded 0, so the budget guardrails under-counted actual spend and
 * "AI Usage Analytics" showed a fraction of reality.
 *
 * `FALLBACK_PER_M_INPUT` keeps an unlisted model costed rather than free.
 */
const PER_MILLION_INPUT_USD: Readonly<Record<string, number>> = {
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
  "gpt-image-1": 5.0,
  "claude-sonnet-4-5": 3.0,
  "claude-sonnet-5": 3.0,
  "claude-opus-4-1": 15.0,
  "grok-3": 3.0,
};

const FALLBACK_PER_M_INPUT = 2.0;

/** Per-generated-image price in cents. Image APIs bill per image, not per token. */
const CENTS_PER_IMAGE = 4;

function perMillionInput(model: string): number {
  return PER_MILLION_INPUT_USD[model] ?? FALLBACK_PER_M_INPUT;
}

export function costCentsForTextResult(model: string, inputTokens: number, outputTokens: number): number {
  const perMInput = perMillionInput(model);
  const inputCents = (inputTokens / 1_000_000) * perMInput * 100;
  const outputCents = (outputTokens / 1_000_000) * perMInput * 5 * 100;
  return Math.max(1, Math.round(inputCents + outputCents));
}

/**
 * Cost of a generated image. Image models return no token counts, so the call
 * is priced per image. Kept separate from the text path so a vision review of
 * an image is not double-charged for the image itself.
 */
export function costCentsForImage(imageCount = 1): number {
  return Math.max(1, CENTS_PER_IMAGE * imageCount);
}

/**
 * Cost of a vision call. Vision responses report text tokens, so it uses the
 * token formula with the reviewing model.
 */
export function costCentsForVision(model: string, inputTokens: number, outputTokens: number): number {
  return costCentsForTextResult(model, inputTokens, outputTokens);
}
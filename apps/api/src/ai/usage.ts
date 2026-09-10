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

export function costCentsForTextResult(model: string, inputTokens: number, outputTokens: number): number {
  const perMInput = 2.0;
  const inputCents = (inputTokens / 1_000_000) * perMInput * 100;
  const outputCents = (outputTokens / 1_000_000) * perMInput * 5 * 100;
  return Math.max(1, Math.round(inputCents + outputCents));
}
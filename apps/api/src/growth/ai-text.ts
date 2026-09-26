// Growth intelligence text generation — reuses the shared AI provider registry.

import type { AiProviderId } from "@nnact/shared";
import { AiProviderRegistry } from "../ai/registry.js";
import { DbAutomationSettingsStore, DbProviderConfigStore } from "../ai/infra.js";

export interface StructuredTextResult {
  content: string;
  structured: Record<string, unknown> | null;
  provider: AiProviderId | null;
}

export async function growthStructuredText(
  orgId: string,
  input: { system: string; prompt: string; task?: string },
): Promise<StructuredTextResult> {
  const configStore = new DbProviderConfigStore();
  const settings = new DbAutomationSettingsStore();
  const registry = new AiProviderRegistry({
    configStore,
    usage: null,
    fake: process.env.PUBLISHING_DEV_MODE === "true" || process.env.NODE_ENV === "test",
  });
  const s = await settings.get(orgId);
  const order = s.textProviderOrder?.length ? s.textProviderOrder : (["CLAUDE", "OPENAI", "GROK"] as AiProviderId[]);
  try {
    const { result } = await registry.generateTextWithFallback(orgId, {
      system: input.system,
      prompt: input.prompt,
      structured: true,
      temperature: 0.2,
      maxTokens: 4096,
      task: input.task ?? "growth_intelligence",
    }, order);
    return {
      content: result.content,
      structured: result.structuredData ?? null,
      provider: result.provider,
    };
  } catch {
    return { content: "", structured: null, provider: null };
  }
}

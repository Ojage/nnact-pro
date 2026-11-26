import { DbAutomationSettingsStore, DbProviderConfigStore, DbUsageStore } from "../../../api/src/ai/infra.ts";
import { AiProviderRegistry } from "../../../api/src/ai/registry.ts";

export const configStore = new DbProviderConfigStore();
export const settingsStore = new DbAutomationSettingsStore();
export const usageStore = new DbUsageStore();
export const registry = new AiProviderRegistry({ configStore, usage: usageStore });

type ProviderOrder = Parameters<AiProviderRegistry["generateTextWithFallback"]>[2];

export async function textProviderOrder(orgId: string): Promise<ProviderOrder> {
  const settings = await settingsStore.get(orgId);
  return (settings.textProviderOrder.length ? [...settings.textProviderOrder] : ["OPENAI"]) as ProviderOrder;
}

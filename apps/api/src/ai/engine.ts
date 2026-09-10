// AI composition root — wires the DB-backed ports, provider registry, quality
// gate (which follows each org's reviewProvider at call time), the enclosing
// notifications adapter, and the automation engine. Shared by the worker loop
// and the Fastify admin routes so both observe the exact same configuration.
import { AutomationEngine } from "./automation.js";
import { AiProviderRegistry } from "./registry.js";
import {
  DbAutomationSettingsStore,
  DbPromptTemplateStore,
  DbProviderConfigStore,
  DbReserveStore,
  DbRunStore,
  DbUsageStore,
} from "./infra.js";
import { HybridQualityAssessor } from "./quality.js";
import type { LogoCompositorPort, QualityAssessorPort } from "./ports.js";
import { inform } from "./notifications.js";

export function publicApiBaseUrl(): string {
  return (process.env.PUBLIC_API_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:3003").replace(/\/$/, "");
}

/** Default compositor: pass-through. (A sharp/sharpie logo overlay can be
 *  swapped in later without touching the automation code.) */
const passthroughCompositor: LogoCompositorPort = {
  async compose(input) {
    return { contentType: input.image.contentType, dataBase64: input.image.dataBase64 };
  },
};

export function createAutomationEngine(): AutomationEngine {
  const configStore = new DbProviderConfigStore();
  const settings = new DbAutomationSettingsStore();
  const runs = new DbRunStore();
  const usage = new DbUsageStore();
  const reserve = new DbReserveStore();
  const templates = new DbPromptTemplateStore();
  const registry = new AiProviderRegistry({ configStore, usage });

  const quality: QualityAssessorPort = {
    async assess(orgId, input) {
      const s = await settings.get(orgId);
      const order = s.reviewProvider ? [s.reviewProvider] : [];
      return new HybridQualityAssessor({ registry, reviewOrder: [...order], threshold: s.qualityThreshold }).assess(orgId, input);
    },
    async assessImage(orgId, prompt, image) {
      const s = await settings.get(orgId);
      const order = s.reviewProvider ? [s.reviewProvider] : [];
      return new HybridQualityAssessor({ registry, reviewOrder: [...order], threshold: s.qualityThreshold }).assessImage(orgId, prompt, image);
    },
  };

  return new AutomationEngine({
    configStore,
    settings,
    runs,
    usage,
    reserve,
    templates,
    quality,
    compositor: passthroughCompositor,
    notifications: { inform },
    registry,
    now: () => new Date(),
    publicApiBaseUrl: publicApiBaseUrl(),
  });
}

export { AutomationEngine };
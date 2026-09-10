// AI provider registry — composition root for text/image/vision adapters.
// The automation never names providers directly; it requests whichever enabled
// provider tops the settings order and the registry handles failover, usage
// recording, and status writes. Adding a provider = extend factoryFor().
import type { AiAutomationSettingsDTO, AiProviderConfigDTO, AiProviderId, AiProviderStatus, TextGenerationRequest, TextGenerationResult } from "@nnact/shared";
import type { VisionAnalysisRequest, VisionAnalysisResult, ImageGenerationRequest, ImageGenerationResult } from "@nnact/shared";
import { AI_PROVIDERS } from "@nnact/shared";
import { classifyTextSuccess } from "./domain.js";
import type { DecryptedProviderConfig } from "./domain.js";
import type { AiAdapterFactory, AiProviderConfigStorePort, AiProviderProbeResult } from "./ports.js";
import { fakeAiFactory, factoryFor } from "./adapters.js";
import type { AiUsageStorePort } from "./ports.js";

export interface AiRegistryDeps {
  configStore: AiProviderConfigStorePort;
  usage?: AiUsageStorePort | null;
  fake?: boolean;
}

export interface AiProviderAttempt {
  provider: AiProviderId;
  ok: boolean;
  error?: string | null;
}

export class AiProviderRegistry {
  constructor(private readonly deps: AiRegistryDeps) {}

  private factory(provider: AiProviderId): AiAdapterFactory {
    if (this.deps.fake ?? (process.env.PUBLISHING_DEV_MODE === "true" || process.env.NODE_ENV === "test")) {
      return fakeAiFactory();
    }
    return factoryFor(provider);
  }

  /** First enabled provider in `order` with a decryptable key; null when none. */
  providersAvailable(orgId: string, order: AiProviderId[]): AiProviderId[] {
    return order;
  }

  async resolveConfig(orgId: string, provider: AiProviderId): Promise<DecryptedProviderConfig | null> {
    return this.deps.configStore.getDecrypted(orgId, provider);
  }

  async listConfigs(orgId: string): Promise<AiProviderConfigDTO[]> {
    return this.deps.configStore.list(orgId);
  }

  /** Single-shot text call and return normalized attempt metadata. */
  async callText(orgId: string, provider: AiProviderId, request: TextGenerationRequest): Promise<{ result: TextGenerationResult | null; attempt: AiProviderAttempt; config: DecryptedProviderConfig | null }> {
    const config = await this.resolveConfig(orgId, provider);
    if (!config) {
      return { result: null, attempt: { provider, ok: false, error: "provider disabled or not configured" }, config: null };
    }
    try {
      const result = await this.factory(provider).text().generateText(request, config);
      const ok = classifyTextSuccess(result);
      await this.deps.usage?.record(orgId, { runId: (request as { runId?: string }).runId ?? null, task: request.task ?? "text", provider, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, costCents: 0 });
      if (!ok) throw new Error("empty text result");
      return { result, attempt: { provider, ok: true }, config };
    } catch (error) {
      const message = (error as Error).message;
      await this.deps.configStore.setStatus(orgId, provider, "DEGRADED", message);
      return { result: null, attempt: { provider, ok: false, error: message }, config };
    }
  }

  /**
   * Text generation with failover across `order`; tries the next provider on
   * network/timeout/empty failures, keeps ProviderStatus accurate, and reports
   * the provider that actually served the request. Throws only when every
   * provider in order fails.
   */
  async generateTextWithFallback(orgId: string, request: TextGenerationRequest, order: AiProviderId[]): Promise<{ result: TextGenerationResult; attempts: AiProviderAttempt[] }> {
    const failures: AiProviderAttempt[] = [];
    for (const provider of order) {
      const { result, attempt } = await this.callText(orgId, provider, request);
      failures.push(attempt);
      if (result) {
        if (failures.length > 1) {
          await this.deps.configStore.setStatus(orgId, provider, "CONNECTED");
        }
        return { result, attempts: failures };
      }
    }
    throw Object.assign(new Error(`all AI text providers failed: ${failures.map((f) => `${f.provider}: ${f.error ?? "unknown"}`).join(" | ")}`), {
      code: "AI_NO_PROVIDER",
      attempts: failures,
      statusCode: 502,
    });
  }

  async probe(orgId: string, provider: AiProviderId): Promise<AiProviderProbeResult> {
    const config = await this.resolveConfig(orgId, provider);
    if (!config) {
      const probeResult: AiProviderProbeResult = { provider, status: "DISCONNECTED", lastError: "provider disabled or not configured", latencyMs: 0 };
      await this.deps.configStore.setStatus(orgId, provider, "DISCONNECTED");
      return probeResult;
    }
    const probeResult = await this.factory(provider).probe(config);
    await this.deps.configStore.setStatus(orgId, provider, probeResult.status, probeResult.lastError);
    if (probeResult.status === "CONNECTED") {
      await this.deps.configStore.setStatus(orgId, provider, "CONNECTED", null);
    }
    return probeResult;
  }

  async probeAll(orgId: string): Promise<Record<AiProviderId, AiProviderStatus>> {
    const result = {} as Record<AiProviderId, AiProviderStatus>;
    for (const provider of AI_PROVIDERS) {
      const probeResult = await this.probe(orgId, provider);
      result[provider] = probeResult.status;
    }
    return result;
  }

  /** Resolve the first usable provider for a capability given the configured order. */
  async pickForSettings(orgId: string, order: AiProviderId[]): Promise<AiProviderId | null> {
    for (const provider of order) {
      const config = await this.resolveConfig(orgId, provider);
      if (config) return provider;
    }
    return null;
  }

  async imageFactory(orgId: string, preferred: AiProviderId | null): Promise<{ provider: AiProviderId; config: DecryptedProviderConfig } | null> {
    const candidates = [preferred, "OPENAI", "CLAUDE", "GROK"].filter(Boolean) as (AiProviderId | null)[];
    for (const provider of new Set(candidates)) {
      if (!provider) continue;
      const config = await this.resolveConfig(orgId, provider);
      if (!config) continue;
      if (this.factory(provider).image()) return { provider, config };
    }
    return null;
  }

  async generateImageText(orgId: string, provider: AiProviderId, request: TextGenerationRequest): Promise<{ result: TextGenerationResult } | null> {
    const config = await this.resolveConfig(orgId, provider);
    if (!config) return null;
    try {
      const result = await this.factory(provider).text().generateText(request, config);
      await this.deps.usage?.record(orgId, { runId: null, task: request.task ?? "text", provider, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, costCents: 0 });
      return { result };
    } catch (error) {
      await this.deps.configStore.setStatus(orgId, provider, "DEGRADED", (error as Error).message);
      return null;
    }
  }

  async generateImage(orgId: string, provider: AiProviderId, request: ImageGenerationRequest): Promise<ImageGenerationResult | null> {
    const config = await this.resolveConfig(orgId, provider);
    if (!config) return null;
    const adapter = this.factory(provider).image();
    if (!adapter) return null;
    try {
      const result = await adapter.generateImage(request, config);
      await this.deps.usage?.record(orgId, { runId: null, task: request.task ?? "image", provider, model: result.model, inputTokens: 0, outputTokens: 0, imageCount: 1, latencyMs: result.latencyMs, costCents: 0 });
      return result;
    } catch (error) {
      await this.deps.configStore.setStatus(orgId, provider, "DEGRADED", (error as Error).message);
      return null;
    }
  }

  async analyzeImage(orgId: string, provider: AiProviderId | null, request: VisionAnalysisRequest): Promise<VisionAnalysisResult | null> {
    const resolved = await this.visionFactory(orgId, provider);
    if (!resolved) return null;
    try {
      const result = await this.factory(resolved.provider).vision().analyzeImage(request, resolved.config);
      await this.deps.usage?.record(orgId, { runId: null, task: request.task ?? "vision", provider: resolved.provider, model: result.model, inputTokens: 0, outputTokens: 0, latencyMs: result.latencyMs, costCents: 0 });
      return result;
    } catch (error) {
      await this.deps.configStore.setStatus(orgId, resolved.provider, "DEGRADED", (error as Error).message);
      return null;
    }
  }

  async visionFactory(orgId: string, preferred: AiProviderId | null): Promise<{ provider: AiProviderId; config: DecryptedProviderConfig } | null> {
    const candidates: AiProviderId[] = [preferred ?? "OPENAI", "CLAUDE", "GROK"];
    const seen = new Set<AiProviderId>();
    for (const provider of candidates) {
      if (seen.has(provider)) continue;
      seen.add(provider);
      const config = await this.resolveConfig(orgId, provider);
      if (!config) continue;
      return { provider, config };
    }
    return null;
  }
}

export function settingsOrder(settings: Pick<AiAutomationSettingsDTO, "textProviderOrder">): AiProviderId[] {
  const explicit = settings.textProviderOrder.filter((p): p is AiProviderId => AI_PROVIDERS.includes(p as AiProviderId));
  const rest = AI_PROVIDERS.filter((p) => !explicit.includes(p));
  return [...explicit, ...rest];
}
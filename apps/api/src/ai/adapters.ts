// Provider adapters — REST implementations for OpenAI, Anthropic, and xAI
// (Grok), plus a deterministic fake used in dev/test so tests never call a
// paid API. Each adapter implements the port interfaces from ports.ts and is
// selected by the registry using stored, decrypted configs.
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from "@nnact/shared";
import type { AiProviderId } from "@nnact/shared";
import type { DecryptedProviderConfig } from "./domain.js";
import type { AiAdapterFactory, AiProviderProbeResult, ImageProviderPort, TextProviderPort, VisionProviderPort } from "./ports.js";
import { TransportError, extractErrorDetail, getJson, postJson } from "./transport.js";

const ONE_PX_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function parseStructured(content: string): Record<string, unknown> | null {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function defaultTextModel(provider: string, configured: string | null): string {
  return configured?.trim() || (provider === "CLAUDE" ? "claude-sonnet-4-5" : provider === "GROK" ? "grok-3" : "gpt-4o");
}

function costMeta(model: string, kind: string, inputTokens: number, outputTokens: number): { inputTokens: number; outputTokens: number } {
  void model;
  void kind;
  return { inputTokens, outputTokens };
}

// ── OpenAI ─────────────────────────────────────────────────────────────────
class OpenAiTextAdapter implements TextProviderPort {
  readonly provider = "OPENAI" as const;

  async generateText(request: TextGenerationRequest, config: DecryptedProviderConfig): Promise<TextGenerationResult> {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const response = await postJson(`${base}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      timeoutMs: config.timeoutMs,
      body: {
        model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          { role: "user", content: request.prompt },
        ],
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxTokens ?? 2048,
        ...(request.structured ? { response_format: { type: "json_object" } } : {}),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `OpenAI returned ${response.status} (model: ${model})`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; id?: string };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new TransportError("empty completion from OpenAI", "HTTP", response.status, response.json);
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    return {
      provider: this.provider,
      model,
      content,
      structuredData: request.structured ? parseStructured(content) : null,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

class OpenAiImageAdapter implements ImageProviderPort {
  readonly provider = "OPENAI" as const;

  async generateImage(request: ImageGenerationRequest, config: DecryptedProviderConfig): Promise<ImageGenerationResult> {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    const model = config.defaultImageModel?.trim() || "gpt-image-1";
    const started = Date.now();
    const response = await postJson(`${base}/v1/images/generations`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      timeoutMs: Math.max(config.timeoutMs, 60_000),
      body: { model, prompt: request.prompt, size: request.size ?? "1024x1024", response_format: "b64_json", n: 1 },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `OpenAI image returned ${response.status}`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new TransportError("image generation returned no data", "HTTP", response.status, response.json);
    const buffer = Buffer.from(b64, "base64");
    return {
      provider: this.provider,
      model,
      contentType: "image/png",
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      bytes: buffer.byteLength,
      width: null,
      height: null,
      latencyMs: Date.now() - started,
      providerRequestId: null,
    };
  }
}

class OpenAiVisionAdapter implements VisionProviderPort {
  readonly provider = "OPENAI" as const;

  async analyzeImage(request: VisionAnalysisRequest, config: DecryptedProviderConfig): Promise<VisionAnalysisResult> {
    const base = (config.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const content = [
      { type: "text", text: request.prompt },
      ...request.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` } })),
    ];
    const response = await postJson(`${base}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      timeoutMs: config.timeoutMs,
      body: { model, messages: [{ role: "user", content }], temperature: 0, max_tokens: 600, response_format: { type: "json_object" } },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `OpenAI vision returned ${response.status}`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; id?: string };
    const verdict = parseStructured(data.choices?.[0]?.message?.content ?? "") ?? {};
    const score = Number(verdict.score ?? 50);
    const issues = Array.isArray(verdict.issues) ? verdict.issues.map(String) : verdict.issues ? [String(verdict.issues)] : [];
    const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 50;
    return {
      provider: this.provider,
      model,
      verdict: verdict.verdict === "PASS" ? "PASS" : "FAIL",
      score: safeScore,
      issues,
      summary: typeof verdict.summary === "string" ? verdict.summary : "",
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

// ── Anthropic ──────────────────────────────────────────────────────────────
class AnthropicTextAdapter implements TextProviderPort {
  readonly provider = "CLAUDE" as const;

  async generateText(request: TextGenerationRequest, config: DecryptedProviderConfig): Promise<TextGenerationResult> {
    const base = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const response = await postJson(`${base}/v1/messages`, {
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      timeoutMs: config.timeoutMs,
      body: {
        model,
        max_tokens: request.maxTokens ?? 2048,
        ...(request.system ? { system: request.system } : {}),
        messages: [{ role: "user", content: request.prompt }],
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `Anthropic returned ${response.status} (model: ${model})`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; id?: string };
    const content = (data.content ?? []).map((b) => b.text ?? "").join("");
    if (!content.trim()) throw new TransportError("empty completion from Anthropic", "HTTP", response.status, response.json);
    return {
      provider: this.provider,
      model,
      content,
      structuredData: request.structured ? parseStructured(content) : null,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

class AnthropicVisionAdapter implements VisionProviderPort {
  readonly provider = "CLAUDE" as const;

  async analyzeImage(request: VisionAnalysisRequest, config: DecryptedProviderConfig): Promise<VisionAnalysisResult> {
    const base = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const response = await postJson(`${base}/v1/messages`, {
      headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      timeoutMs: config.timeoutMs,
      body: {
        model,
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              ...request.images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.dataBase64 } })),
              { type: "text", text: request.prompt },
            ],
          },
        ],
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `Anthropic vision returned ${response.status}`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { content?: { type?: string; text?: string }[]; id?: string };
    const verdict = parseStructured((data.content ?? []).map((b) => b.text ?? "").join("")) ?? {};
    const score = Number(verdict.score ?? 50);
    const issues = Array.isArray(verdict.issues) ? verdict.issues.map(String) : verdict.issues ? [String(verdict.issues)] : [];
    const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 50;
    return {
      provider: this.provider,
      model,
      verdict: verdict.verdict === "PASS" ? "PASS" : "FAIL",
      score: safeScore,
      issues,
      summary: typeof verdict.summary === "string" ? verdict.summary : "",
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

// ── Grok (xAI) — OpenAI-compatible chat ────────────────────────────────────
class GrokTextAdapter implements TextProviderPort {
  readonly provider = "GROK" as const;

  async generateText(request: TextGenerationRequest, config: DecryptedProviderConfig): Promise<TextGenerationResult> {
    const base = (config.baseUrl ?? "https://api.x.ai").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const response = await postJson(`${base}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      timeoutMs: config.timeoutMs,
      body: {
        model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          { role: "user", content: request.prompt },
        ],
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxTokens ?? 2048,
        ...(request.structured ? { response_format: { type: "json_object" } } : {}),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `Grok returned ${response.status} (model: ${model})`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; id?: string };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new TransportError("empty completion from Grok", "HTTP", response.status, response.json);
    return {
      provider: this.provider,
      model,
      content,
      structuredData: request.structured ? parseStructured(content) : null,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

class GrokVisionAdapter implements VisionProviderPort {
  readonly provider = "GROK" as const;

  async analyzeImage(request: VisionAnalysisRequest, config: DecryptedProviderConfig): Promise<VisionAnalysisResult> {
    const base = (config.baseUrl ?? "https://api.x.ai").replace(/\/$/, "");
    const model = defaultTextModel(this.provider, config.defaultTextModel);
    const started = Date.now();
    const content = [
      { type: "text", text: request.prompt },
      ...request.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` } })),
    ];
    const response = await postJson(`${base}/v1/chat/completions`, {
      headers: { authorization: `Bearer ${config.apiKey}` },
      timeoutMs: config.timeoutMs,
      body: { model, messages: [{ role: "user", content }], temperature: 0, max_tokens: 600, response_format: { type: "json_object" } },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError(extractErrorDetail(response.json, `Grok vision returned ${response.status}`), "HTTP", response.status, response.json, response.status === 429 || response.status >= 500);
    }
    const data = response.json as { choices?: { message?: { content?: string } }[]; id?: string };
    const verdict = parseStructured(data.choices?.[0]?.message?.content ?? "") ?? {};
    const score = Number(verdict.score ?? 50);
    const issues = Array.isArray(verdict.issues) ? verdict.issues.map(String) : verdict.issues ? [String(verdict.issues)] : [];
    return {
      provider: this.provider,
      model,
      verdict: verdict.verdict === "PASS" ? "PASS" : "FAIL",
      score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 50,
      issues,
      summary: typeof verdict.summary === "string" ? verdict.summary : "",
      latencyMs: Date.now() - started,
      providerRequestId: data.id ?? null,
    };
  }
}

// ── Fake (dev / test) ──────────────────────────────────────────────────────
const FAKE_FACTS = [
  "Regular oil analysis on NNP gensets predicts component wear before breakdowns.",
  "Houston-area HVAC units lose ~30% efficiency when filter maintenance is skipped.",
  "Predictive maintenance on conveyor gearboxes reduces unplanned downtime by 40%.",
  "IAS-embedded inspections of switchgear catch thermal hot spots earlier than thermography alone.",
];

class FakeTextAdapter implements TextProviderPort {
  readonly provider = "OPENAI" as const;

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const model = "fake-openai-gpt-4o";
    const structured: Record<string, unknown> = {
      title: "Keeping Heavy Machinery Running",
      summary: "What reliable equipment means for field operations.",
      seoDescription: "Field-tested maintenance routines by NNACT.",
      blocks: [
        { type: "paragraph", text: FAKE_FACTS[0] },
        { type: "paragraph", text: "Call your local NNACT team today to schedule a field visit." },
      ],
      hashtags: ["#maintenance", "#reliability"],
      cta: "Contact NNACT",
    };
    const content = request.structured ? JSON.stringify(structured) : request.prompt.length > 200 ? String(structured.title) : "Fake response: yes.";
    return {
      provider: this.provider,
      model,
      content,
      structuredData: request.structured ? structured : null,
      inputTokens: 100,
      outputTokens: 64,
      latencyMs: 1,
      providerRequestId: "fake-text",
    };
  }
}

class FakeImageAdapter implements ImageProviderPort {
  readonly provider = "OPENAI" as const;

  async generateImage(): Promise<ImageGenerationResult> {
    const buffer = Buffer.from(ONE_PX_PNG_BASE64, "base64");
    return {
      provider: this.provider,
      model: "fake-openai-gpt-image-1",
      contentType: "image/png",
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      bytes: buffer.byteLength,
      width: 1,
      height: 1,
      latencyMs: 1,
      providerRequestId: "fake-image",
    };
  }
}

class FakeVisionAdapter implements VisionProviderPort {
  readonly provider = "OPENAI" as const;

  async analyzeImage(): Promise<VisionAnalysisResult> {
    return { provider: this.provider, model: "fake-openai-gpt-4o", verdict: "PASS", score: 95, issues: [], summary: "fake review", latencyMs: 1, providerRequestId: "fake-vision" };
  }
}

// ── Adapter factory ────────────────────────────────────────────────────────
export function probeHeadersFor(provider: AiProviderId, apiKey: string): Record<string, string> {
  return provider === "CLAUDE"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { authorization: `Bearer ${apiKey}` };
}

function probeViaModels(config: DecryptedProviderConfig, provider: AiProviderId, baseEnv: string): Promise<AiProviderProbeResult> {
  const started = Date.now();
  const base = (config.baseUrl ?? baseEnv).replace(/\/$/, "");
  return getJson(`${base}/v1/models`, {
    headers: probeHeadersFor(provider, config.apiKey),
    timeoutMs: config.timeoutMs,
  })
    .then((r) => {
      if (r.status === 200) return { provider, status: "CONNECTED" as const, lastError: null, latencyMs: Date.now() - started };
      const status: "INVALID" | "DEGRADED" = r.status === 401 ? "INVALID" : "DEGRADED";
      return { provider, status, lastError: extractErrorDetail(r.json, `HTTP ${r.status}`), latencyMs: Date.now() - started };
    })
    .catch((error) => ({ provider, status: "DEGRADED" as const, lastError: (error as Error).message, latencyMs: Date.now() - started }));
}

export function factoryFor(provider: "OPENAI" | "CLAUDE" | "GROK"): AiAdapterFactory {
  switch (provider) {
    case "OPENAI":
      return {
        probe: (config) => probeViaModels(config, "OPENAI", "https://api.openai.com"),
        text: () => new OpenAiTextAdapter(),
        image: () => new OpenAiImageAdapter(),
        vision: () => new OpenAiVisionAdapter(),
      };
    case "CLAUDE":
      return {
        probe: (config) => probeViaModels(config, "CLAUDE", "https://api.anthropic.com"),
        text: () => new AnthropicTextAdapter(),
        image: () => null,
        vision: () => new AnthropicVisionAdapter(),
      };
    case "GROK":
      return {
        probe: (config) => probeViaModels(config, "GROK", "https://api.x.ai"),
        text: () => new GrokTextAdapter(),
        image: () => null,
        vision: () => new GrokVisionAdapter(),
      };
  }
}

export function fakeAiFactory(): AiAdapterFactory {
  return {
    probe: () => Promise.resolve({ provider: "OPENAI", status: "CONNECTED", lastError: null, latencyMs: 0 }),
    text: () => new FakeTextAdapter(),
    image: () => new FakeImageAdapter(),
    vision: () => new FakeVisionAdapter(),
  };
}

export function normalizeUsage(result: TextGenerationResult): { inputTokens: number; outputTokens: number } {
  return costMeta(result.model, "text", result.inputTokens, result.outputTokens);
}
// Provider HTTP transport — fetch with timeout, response size caps, and
// normalized failures. No SDK: the three providers speak the same REST shapes
// (OpenAI-compatible chat, Anthropic messages, OpenAI images).
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export interface HttpJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  json: unknown;
}

export class TransportError extends Error {
  constructor(
    message: string,
    readonly code: "TIMEOUT" | "NETWORK" | "HTTP" | "TOO_LARGE" | "INVALID_JSON",
    readonly status?: number,
    readonly body?: unknown,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export async function postJson(url: string, options: HttpJsonOptions): Promise<HttpResponse> {
  return request("POST", url, options);
}

export async function getJson(url: string, options: HttpJsonOptions): Promise<HttpResponse> {
  return request("GET", url, options);
}

async function request(method: "GET" | "POST", url: string, options: HttpJsonOptions): Promise<HttpResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { accept: "application/json", ...(options.headers ?? {}) },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new TransportError(`request timed out after ${timeoutMs}ms`, "TIMEOUT", undefined, undefined, true);
    throw new TransportError((error as Error).message, "NETWORK", undefined, undefined, true);
  } finally {
    clearTimeout(timeout);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new TransportError("response body too large", "TOO_LARGE", response.status);

  let json: unknown;
  try {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new TransportError("response body too large", "TOO_LARGE", response.status);
    json = text.length ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof TransportError) throw error;
    throw new TransportError("invalid JSON response", "INVALID_JSON", response.status);
  }

  const retryableStatus = response.status === 429 || (response.status >= 500 && response.status <= 599);
  return { status: response.status, json };
}

export function extractErrorDetail(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const rec = json as Record<string, unknown>;
    if (typeof rec.error === "object" && rec.error) {
      const e = rec.error as Record<string, unknown>;
      const msg = e.message ?? e.messages;
      if (typeof msg === "string" && msg) return msg;
      if (Array.isArray(msg)) return msg.map((m) => (m && typeof m === "object" ? String((m as Record<string, unknown>).message ?? "") : String(m))).filter(Boolean).join("; ");
    }
    if (typeof rec.error === "string" && rec.error) return rec.error;
    if (typeof rec.message === "string" && rec.message) return rec.message;
  }
  return fallback;
}

export function sseTextPayload(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<string> {
  return postJson(url, { headers, body, timeoutMs }).then((r) => {
    const data = r.json as { output_text?: string; content?: string };
    if (typeof data.output_text === "string") return data.output_text;
    return data.content ?? "";
  });
}

export function dataUrlForImage(mediaType: string, dataBase64: string): string {
  return `data:${mediaType};base64,${dataBase64}`;
}
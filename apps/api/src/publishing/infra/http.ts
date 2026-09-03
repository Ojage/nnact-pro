// Minimal fetch helper with timeout for outbound provider calls.
// Network errors are thrown as normalized errors caller maps to the taxonomy.
import { errorFromHttpStatus } from "../domain/errors.js";
import type { NormalizedProviderError } from "@nnact/shared";

export interface HttpResponse {
  status: number;
  body: unknown;
}

export async function providerFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  timeoutMs = 15_000,
): Promise<HttpResponse> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  } catch (err) {
    throw normalizeFetchError(err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeFetchError(err: unknown): NormalizedProviderError {
  const e = err as { name?: string; code?: string };
  if (e?.name === "AbortError") return errorFromHttpStatus(408, "provider request timed out");
  if (e?.code === "ENOTFOUND" || e?.code === "ECONNREFUSED" || e?.code === "ECONNRESET") {
    return { code: "NETWORK_ERROR", message: "network error reaching provider", retryable: true };
  }
  return { code: "UNKNOWN_PROVIDER_ERROR", message: (e as Error)?.message ?? "provider error", retryable: true };
}

export class ProviderError extends Error {
  constructor(public readonly normalized: NormalizedProviderError) {
    super(normalized.message);
    this.name = "ProviderError";
  }
}

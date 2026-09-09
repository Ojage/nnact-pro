/**
 * EtechKeys SMS provider — implements ISmsSender using the v1 API.
 *
 * Primary flow  : POST /api/login -> bearer token (cached in memory) -> POST /api/v1/send-sms
 * Fallback flow : POST /api/v1/send-sms-key with an API key + destinataire
 *
 * The bearer token is cached for the lifetime of the process and refreshed on
 * a single retry after a 401/403. Settings come from etechKeysSettingsStore
 * (DB row) with environment-variable fallbacks.
 */
import type { ISmsSender, SendSMSOptions } from "./types.js";
import { SmsError } from "./types.js";
import { etechKeysSettingsStore } from "./etech-keys-store.js";
import { normalizePhone } from "./phone.js";
import type { EtechKeysConfig } from "./etech-keys-config.js";

const DEFAULT_TIMEOUT_MS = 15_000;

interface SmsApiResponse {
  success?: boolean;
  id?: string;
  credits_used?: number;
  error?: string;
}

export interface SendSmsResult {
  id: string;
  creditsUsed: number;
}

export class EtechKeysService implements ISmsSender {
  private bearerToken: string | null = null;
  private config: EtechKeysConfig | null = null;

  /** @internal test seam */
  private _store = etechKeysSettingsStore;

  /** @internal test seam */
  private _fetch: typeof fetch = (...args) => fetch(...args);

  /** @internal test seam */
  _injectStore(store: Pick<typeof etechKeysSettingsStore, "resolve">) {
    this._store = { ...this._store, ...store };
    return this;
  }

  /** @internal test seam */
  _injectFetch(fn: typeof fetch) {
    this._fetch = fn;
    return this;
  }

  async onModuleInit(): Promise<void> {
    await this.reloadConfig();
  }

  /** Optionally clears the cached token (e.g. after config rotation). */
  resetTokenCache(): void {
    this.bearerToken = null;
  }

  private async reloadConfig(): Promise<void> {
    const row = await this._store.resolve();
    this.config = {
      baseUrl: row.baseUrl,
      legacyBaseUrl: row.legacyBaseUrl,
      username: row.username ?? undefined,
      password: row.password ?? undefined,
      apiKey: row.apiKey ?? undefined,
      senderId: row.senderId ?? "ETECH KEYS",
      isActive: row.isActive,
    };
    // A settings change invalidates the cached credentials.
    this.bearerToken = null;
  }

  /** Normalize a Cameroon-typical number to 237XXXXXXXXX. */
  normalizePhone(input: string): string {
    return normalizePhone(input);
  }

  async sendSMS(options: SendSMSOptions): Promise<void> {
    const numbers = Array.isArray(options.to) ? options.to : [options.to];
    if (numbers.length === 0) throw new SmsError("no recipients provided", 400, "etechkeys");
    const payload: SendSMSOptions = {
      ...options,
      to: numbers.map((n) => this.normalizePhone(n)),
      from: options.from ?? this.config?.senderId,
    };
    for (const number of payload.to) {
      await this.sendToSingle({ ...payload, to: number });
    }
  }

  private async sendToSingle(options: SendSMSOptions): Promise<{ id?: string; creditsUsed?: number } | null> {
    if (!this.config) await this.reloadConfig();
    if (!this.config!.isActive) throw new SmsError("EtechKeys provider is inactive", 503, "etechkeys");

    const to = this.normalizePhone(options.to as string);
    const senderId = options.from ?? this.config!.senderId;
    const hasCredentials = Boolean(this.config!.username && this.config!.password);

    if (hasCredentials) {
      try {
        return await this.sendWithBearer(to, options.message, senderId!);
      } catch (error) {
        if (error instanceof SmsError && (error.statusCode === 401 || error.statusCode === 403)) {
          // Token expired — refresh once and retry.
          this.bearerToken = null;
          return this.sendWithBearer(to, options.message, senderId!);
        }
        throw error;
      }
    }

    if (this.config!.apiKey) {
      return this.sendWithApiKey(to, options.message, senderId!);
    }

    throw new SmsError("EtechKeys is not configured: set ETECH_KEYS_LOGIN/PASSWORD or ETECH_KEYS_API_KEY", 503, "etechkeys");
  }

  /** Sends a single test message and returns the provider id + credits used. */
  async sendTestSms(
    to: string,
    message: string,
    from?: string,
  ): Promise<{ id?: string; creditsUsed?: number }> {
    const result = (await this.sendToSingle({ to, message, from })) ?? {};
    return { id: result.id, creditsUsed: result.creditsUsed };
  }

  private async authenticate(): Promise<string> {
    if (this.bearerToken) return this.bearerToken;
    const { baseUrl, username, password } = this.config!;
    if (!username || !password) throw new SmsError("EtechKeys bearer credentials are not configured", 503, "etechkeys");

    const response = await this.post<{ token?: string; user?: unknown; error?: string }>(
      `${baseUrl}/api/login`,
      { username, password },
    );
    if (!response.token) {
      throw new SmsError(response.error ?? "EtechKeys login returned no token", 401, "etechkeys");
    }
    this.bearerToken = response.token;
    return this.bearerToken;
  }

  private async sendWithBearer(to: string, message: string, senderId: string): Promise<{ id?: string; creditsUsed?: number }> {
    const { baseUrl } = this.config!;
    const token = await this.authenticate();
    const data = await this.postJson<{ success?: boolean; id?: string; credits_used?: number; error?: string }>(
      `${baseUrl}/api/v1/send-sms`,
      { sender_id: senderId, to, msg: message },
      token,
    );
    return this.classifyResponse(data);
  }

  private async sendWithApiKey(to: string, message: string, senderId: string): Promise<{ id?: string; creditsUsed?: number }> {
    const { baseUrl, apiKey } = this.config!;
    const data = await this.postJson<{ success?: boolean; id?: string; credits_used?: number; error?: string }>(
      `${baseUrl}/api/v1/send-sms-key`,
      { api_key: apiKey!, sender_id: senderId, destinataire: to, message },
    );
    return this.classifyResponse(data);
  }

  private classifyResponse(data: unknown): { id?: string; creditsUsed?: number } {
    const body = (data ?? {}) as SmsApiResponse;
    if (body.success === false || (body && !("success" in body) && body.error)) {
      throw new SmsError(body.error ?? "EtechKeys reported a failed SMS send", 502, "etechkeys");
    }
    return { id: body.id, creditsUsed: body.credits_used };
  }

  async getSmsLogs(page = 1, perPage = 50): Promise<unknown> {
    const { baseUrl } = this.config!;
    const token = await this.authenticate();
    return this.getJson(`${baseUrl}/api/v1/sms-logs?page=${page}&per_page=${perPage}`, token);
  }

  async getSmsLogsByOperator(operator: "mtn" | "orange" | "camtel"): Promise<unknown> {
    const { baseUrl } = this.config!;
    const token = await this.authenticate();
    return this.getJson(`${baseUrl}/api/v1/sms-logs/${operator}`, token);
  }

  async checkDeliveryStatus(smsId: string): Promise<unknown> {
    const { legacyBaseUrl } = this.config!;
    const response = await this.post<Record<string, unknown>>(`${legacyBaseUrl}/api/dlr.php`, { id: smsId });
    return response;
  }

  /** Optional: the v1 API does not expose a balance endpoint, so this throws by design. */
  async getBalance(): Promise<{ available: number }> {
    throw new SmsError("EtechKeys API does not expose a balance endpoint", 501, "etechkeys");
  }

  // --- HTTP primitives (native fetch; Node >= 22) ---

  private async postJson<T>(url: string, body: Record<string, unknown>, token?: string): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  private async post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async getJson<T>(url: string, token?: string): Promise<T> {
    return this.request<T>(url, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this._fetch(url, { ...init, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new SmsError("EtechKeys request timed out", 504, "etechkeys");
      }
      throw new SmsError(`EtechKeys network error: ${error instanceof Error ? error.message : "unknown"}`, 502, "etechkeys");
    }

    if (response.status === 401 || response.status === 403) {
      throw new SmsError(`EtechKeys authentication failed (HTTP ${response.status})`, response.status, "etechkeys");
    }
    if (!response.ok) {
      if (response.status === 404) throw new SmsError("EtechKeys endpoint not found", 404, "etechkeys");
      throw new SmsError(`EtechKeys returned HTTP ${response.status}`, 502, "etechkeys");
    }

    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SmsError("EtechKeys returned a malformed response", 502, "etechkeys");
    }
  }
}

export const etechKeysService = new EtechKeysService();

/** Background-safe: refresh cached credentials on an interval by touching config. */
export function createEtechKeysRefresher(service: EtechKeysService, ms: number) {
  const id = setInterval(() => {
    void service
      .onModuleInit()
      .catch(() => {});
  }, ms);
  id.unref?.();
  return () => clearInterval(id);
}
/**
 * Configuration for the EtechKeys SMS provider.
 * Persisted in the `etech_keys_settings` table with environment-variable
 * fallbacks. Values are never returned to clients; they are read server-side
 * by the provider.
 */

/**
 * The provider appends versioned endpoints (e.g. `/api/v1/send-sms`) to the
 * base URL, so operators may configure either the bare host
 * (`https://v1.api.etech-keys.com`) or the versioned prefix
 * (`https://v1.api.etech-keys.com/api/v1`). Both must behave identically:
 * fold any trailing `/api/v1` into a single canonical base.
 */
export function normalizeEtechKeysBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

export interface EtechKeysConfig {
  baseUrl: string;
  legacyBaseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  senderId?: string;
  isActive: boolean;
}

export interface EtechKeysSettingsRow {
  id: string;
  name: string;
  baseUrl: string;
  legacyBaseUrl: string;
  username: string | null;
  password: string | null;
  apiKey: string | null;
  senderId: string | null;
  isActive: boolean;
  providerType: string;
  createdAt: Date;
  updatedAt: Date;
}

export function defaultEtechKeysConfig(): EtechKeysConfig {
  return {
    baseUrl: normalizeEtechKeysBaseUrl(process.env.ETECH_KEYS_BASE_URL?.trim() || "https://v1.api.etech-keys.com"),
    legacyBaseUrl: process.env.ETECH_KEYS_LEGACY_BASE_URL?.trim() || "https://sms.etech-keys.com",
    username: process.env.ETECH_KEYS_LOGIN?.trim() || undefined,
    password: process.env.ETECH_KEYS_PASSWORD || undefined,
    apiKey: process.env.ETECH_KEYS_API_KEY?.trim() || undefined,
    senderId: process.env.ETECH_KEYS_SENDER_ID?.trim() || "ETECH KEYS",
    isActive: true,
  };
}

export function configFromRow(row: EtechKeysSettingsRow): EtechKeysConfig {
  return {
    baseUrl: normalizeEtechKeysBaseUrl(row.baseUrl),
    legacyBaseUrl: row.legacyBaseUrl,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
    apiKey: row.apiKey ?? undefined,
    senderId: row.senderId ?? "ETECH KEYS",
    isActive: row.isActive,
  };
}
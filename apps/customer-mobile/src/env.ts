/**
 * Resolves the API base URL for Expo / React Native.
 *
 * - Defaults to the hosted API (https://api.pro.nnact.com).
 * - Override with EXPO_PUBLIC_API_URL or root .env for local development.
 * - When localhost is configured, Android emulator uses 10.0.2.2; physical
 *   devices use the Metro bundler host IP.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { NNACT_PRODUCTION_API_URL } from "@nnact/shared";

function configuredOrigin(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    NNACT_PRODUCTION_API_URL
  );
}

function metroDevHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.linkingUri;
  if (!hostUri) return null;
  const host = hostUri.replace(/^[^:]+:\/\//, "").split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host;
}

export function getApiUrl(): string {
  const origin = configuredOrigin();
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return origin;
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLoopback) return origin.replace(/\/$/, "");

  if (Platform.OS === "android") {
    url.hostname = "10.0.2.2";
    return url.origin;
  }

  const devHost = metroDevHost();
  if (devHost) {
    url.hostname = devHost;
    return url.origin;
  }

  return origin.replace(/\/$/, "");
}

export function getDefaultOrgId(): string {
  return (
    process.env.EXPO_PUBLIC_DEFAULT_ORG_ID ??
    (Constants.expoConfig?.extra?.defaultOrgId as string | undefined) ??
    ""
  );
}

export function formatNetworkError(error: unknown, apiUrl: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!/network request failed|failed to fetch|network error/i.test(message)) {
    return message.replace(/^\d+:\s*/, "");
  }

  const isLocalDev = /localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\./.test(apiUrl);
  if (isLocalDev) {
    return `Cannot reach the API at ${apiUrl}. Start it with "pnpm dev:api", set EXPO_PUBLIC_API_URL in the repo .env, and restart Expo.`;
  }
  return `Cannot reach the API at ${apiUrl}. Check your internet connection and try again.`;
}

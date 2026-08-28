/**
 * Resolves the API base URL for Expo / React Native.
 *
 * - Loads from EXPO_PUBLIC_API_URL or app.config.js `extra.apiUrl` (from root .env).
 * - Android emulator: localhost → 192.168.1.191 (host loopback).
 * - Physical device + Expo Go: uses Metro host IP when localhost is configured.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

function configuredOrigin(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    "http://localhost:3003"
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
  if (!isLoopback) return origin;

  if (Platform.OS === "android") {
    url.hostname = "192.168.1.191";
    return url.origin;
  }

  const devHost = metroDevHost();
  if (devHost) {
    url.hostname = devHost;
    return url.origin;
  }

  return origin;
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
  if (/network request failed|failed to fetch|network error/i.test(message)) {
    return `Cannot reach the API at ${apiUrl}. Start it with "pnpm dev:api" and restart Expo after changing .env.`;
  }
  return message.replace(/^\d+:\s*/, "");
}

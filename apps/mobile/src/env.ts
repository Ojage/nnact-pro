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
import { NNACT_PRODUCTION_API_URL, apiErrorMessage } from "@nnact/shared";

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

export function formatNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/network request failed|failed to fetch|network error/i.test(message)) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  const match = /^(\d{3}):\s*/.exec(message);
  const status = match ? Number(match[1]) : 0;
  const body = match ? message.slice(match[0].length) : message;
  const friendly = apiErrorMessage(status, body);
  return friendly || "Something went wrong. Please try again.";
}

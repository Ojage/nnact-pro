const INSECURE_JWT_VALUES = new Set([
  "",
  "change-me-in-production",
  "changeme",
  "secret",
  "development-secret",
]);

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.JWT_SECRET?.trim() ?? "";
  if (env.NODE_ENV === "production") {
    if (INSECURE_JWT_VALUES.has(configured.toLowerCase()) || configured.length < 32) {
      throw new Error("JWT_SECRET must be a unique production secret of at least 32 characters");
    }
    return configured;
  }
  return configured || "openfieldpro-development-only-secret";
}

export function resolveCorsOrigin(env: NodeJS.ProcessEnv = process.env): true | string | string[] {
  if (env.NODE_ENV !== "production") return true;

  const configured = env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  if (configured.length === 0) {
    throw new Error("CORS_ORIGIN is required in production");
  }
  if (configured.includes("*")) {
    throw new Error("CORS_ORIGIN cannot use a wildcard in production");
  }

  for (const origin of configured) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN contains an invalid URL: ${origin}`);
    }
    if (parsed.origin !== origin.replace(/\/$/, "")) {
      throw new Error(`CORS_ORIGIN must contain origins only, without paths: ${origin}`);
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error(`CORS_ORIGIN must use HTTPS outside local development: ${origin}`);
    }
  }

  return configured.length === 1 ? configured[0] : configured;
}

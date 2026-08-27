const INSECURE_JWT_VALUES = new Set([
  "",
  "change-me-in-production",
  "changeme",
  "secret",
  "development-secret",
]);

function validateOrigin(value: string, setting: string, production: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${setting} contains an invalid URL: ${value}`);
  }
  const normalized = value.replace(/\/$/, "");
  if (parsed.origin !== normalized) {
    throw new Error(`${setting} must contain an origin only, without a path: ${value}`);
  }
  if (production && parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error(`${setting} must use HTTPS outside local development: ${value}`);
  }
  return normalized;
}

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.JWT_SECRET?.trim() ?? "";
  if (env.NODE_ENV === "production") {
    if (INSECURE_JWT_VALUES.has(configured.toLowerCase()) || configured.length < 32) {
      throw new Error("JWT_SECRET must be a unique production secret of at least 32 characters");
    }
    return configured;
  }
  return configured || "nnactpro-development-only-secret";
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

  const validated = configured.map((origin) => validateOrigin(origin, "CORS_ORIGIN", true));
  return validated.length === 1 ? validated[0] : validated;
}

export function resolvePublicWebUrl(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const configured = env.PUBLIC_WEB_URL?.trim() || (production ? "" : "http://localhost:3000");
  if (!configured) throw new Error("PUBLIC_WEB_URL is required in production when creating payment checkout sessions");
  return validateOrigin(configured, "PUBLIC_WEB_URL", production);
}

export function publicRegistrationEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return env.NNPALLOW_PUBLIC_REGISTRATION !== "false";
  return env.NNPALLOW_PUBLIC_REGISTRATION === "true";
}

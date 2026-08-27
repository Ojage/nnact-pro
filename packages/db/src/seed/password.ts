import { createHash, scryptSync } from "node:crypto";

/** Development-only demo password — never use in production. */
export const NNACT_DEMO_PASSWORD = "NnactDemo@2026";

/** Deterministic scrypt hash so re-seeding does not rotate credentials. */
export function demoPasswordHash(password: string, identity: string): string {
  const salt = createHash("sha256").update(`nnact-demo-seed:v1:${identity}`).digest().subarray(0, 16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

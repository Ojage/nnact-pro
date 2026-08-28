import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the monorepo root `.env` so process.env sees API_PORT /
 * NEXT_PUBLIC_* at their canonical values whether the API is started via
 * `pnpm dev:api`, a container, or tests. `process.loadEnvFile` never
 * overwrites variables that are already present in the environment.
 *
 * Must be imported first: ESM evaluates dependencies in import order, so any
 * later `import` of a route module that reads process.env at module scope sees
 * the loaded values.
 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  // apps/api/src → ../../../ = repository root .env
  path.resolve(moduleDir, "../../../.env"),
  // apps/api/src → ../../ = apps/.env, then ./ = apps/api/.env
  path.resolve(moduleDir, "../../.env"),
  path.resolve(moduleDir, "../.env"),
];

for (const candidate of candidates) {
  try {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  } catch {
    // Best-effort: environments may supply their own variables.
  }
}
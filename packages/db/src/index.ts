// Drizzle client singleton. Import `db` and `schema` everywhere.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as coreSchema from "./schema.js";
import * as servicePlanSchema from "./service-plans.js";
import * as diagnosticSchema from "./diagnostics.js";
import * as repairBrainSchema from "./repair-brain.js";

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp";

// One connection pool per process. ponytail: max 10 is plenty for the current
// product foundation; raise it only after measuring real concurrency.
const client = postgres(url, { max: 10 });

export const schema = { ...coreSchema, ...servicePlanSchema, ...diagnosticSchema, ...repairBrainSchema };
export const db = drizzle(client, { schema });
export * from "./schema.js";
export * from "./service-plans.js";
export * from "./diagnostics.js";
export * from "./repair-brain.js";

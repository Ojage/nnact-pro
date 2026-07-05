// Drizzle client singleton. Import `db` and `schema` everywhere.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as coreSchema from "./schema.js";
import * as servicePlanSchema from "./service-plans.js";

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp";

// One connection pool per process. ponytail: max 10 is plenty for Phase 1;
// raise (and add a read replica URL) when concurrency actually demands it.
const client = postgres(url, { max: 10 });

export const schema = { ...coreSchema, ...servicePlanSchema };
export const db = drizzle(client, { schema });
export * from "./schema.js";
export * from "./service-plans.js";

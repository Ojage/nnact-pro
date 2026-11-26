// Drizzle client singleton. Import `db` and `schema` everywhere.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as coreSchema from "./schema.js";
import * as servicePlanSchema from "./service-plans.js";
import * as diagnosticSchema from "./diagnostics.js";
import * as repairBrainSchema from "./repair-brain.js";
import * as financeSchema from "./finance.js";
import * as comebackSchema from "./comeback.js";
import * as growthSchema from "./growth.js";

import * as authAccountsSchema from "./auth-accounts.js";
import * as contentSchema from "./content.js";
import * as aiSchema from "./ai.js";
import * as etechKeysSchema from "./etech-keys.js";
import * as customerPortalSchema from "./customer-portal.js";
import * as agentSchema from "./agent.js";
import * as priceBookSchema from "./price-book.js";
import * as dispatchSchema from "./dispatch.js";
import * as agentOfficeSchema from "./agent-office.js";
import * as agentWorkflowsSchema from "./agent-workflows.js";
import * as branchesSchema from "./branches.js";

const url = process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp";

// One connection pool per process. ponytail: max 10 is plenty for the current
// product foundation; raise it only after measuring real concurrency.
const client = postgres(url, { max: 10 });

export const schema = { ...coreSchema, ...servicePlanSchema, ...diagnosticSchema, ...repairBrainSchema, ...financeSchema, ...comebackSchema, ...growthSchema, ...authAccountsSchema, ...contentSchema, ...aiSchema, ...etechKeysSchema, ...customerPortalSchema, ...agentSchema, ...priceBookSchema, ...dispatchSchema, ...agentOfficeSchema, ...agentWorkflowsSchema, ...branchesSchema };
export const db = drizzle(client, { schema });

/** Close the pool, so a script or test process can exit. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
export * from "./schema.js";
export * from "./service-plans.js";
export * from "./diagnostics.js";
export * from "./repair-brain.js";
export * from "./finance.js";
export * from "./comeback.js";
export * from "./growth.js";
export * from "./auth-accounts.js";
export * from "./content.js";
export * from "./ai.js";
export * from "./etech-keys.js";
export * from "./customer-portal.js";
export * from "./agent.js";
export * from "./price-book.js";
export * from "./dispatch.js";
export * from "./agent-office.js";
export * from "./agent-workflows.js";
export * from "./branches.js";

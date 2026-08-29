import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (process.env.ALLOW_SCHEMA_PUSH !== "true") {
  throw new Error("Refusing migration: set ALLOW_SCHEMA_PUSH=true only after reviewing committed migrations");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

// The drizzle-orm migrator applies entries positionally: an entry runs only when
// its journal `when` is greater than the highest `created_at` recorded on the
// target database. An out-of-order journal therefore SILENTLY SKIPS a pending
// migration (it looks applied while the DDL never runs), which then fails the
// schema-parity gate on every deploy. Fail early instead of skipping.
const journal = JSON.parse(
  await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: { idx: number; tag: string; when: number }[] };
let previousWhen = Number.NEGATIVE_INFINITY;
for (const entry of journal.entries) {
  if (entry.when <= previousWhen) {
    throw new Error(
      `Out-of-order migration ${entry.tag} (idx ${entry.idx}): when=${entry.when} is not greater than ` +
        `the previous entry's when=${previousWhen}. Regenerate with drizzle-kit or fix the journal timestamps ` +
        "so they increase monotonically.",
    );
  }
  previousWhen = entry.when;
}

const client = postgres(databaseUrl, { max: 1 });
try {
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Committed database migrations applied successfully.");
} finally {
  await client.end();
}

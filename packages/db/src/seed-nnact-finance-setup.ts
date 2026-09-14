// One-off idempotent upsert of the NNACT recommended finance setup
// (expense categories + cost centers) against the live database. Safe to
// re-run; only touches the NNACT org and never deletes user-created records.
// Used by the production `seed-finance-setup` compose job.
import { db } from "./index.js";
import { seedNnactFinanceSetup } from "./seed/nnact-finance-setup.js";

async function main() {
  const result = await seedNnactFinanceSetup(db);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
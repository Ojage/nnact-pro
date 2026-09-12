// One-off idempotent upsert of the NNACT service-catalog demo seed
// (categories, checklists, plan templates, agreements, visits) against the
// live database. Safe to re-run; only touches the NNACT org. Used by the
// production `seed-service-plans` compose job.
import { db } from "./index.js";
import { seedNnactServicePlans } from "./seed/nnact-service-plans.js";

async function main() {
  await seedNnactServicePlans(db);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
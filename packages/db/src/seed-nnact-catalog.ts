import { seedNnactCatalog } from "./seed/nnact-catalog.js";
import { NNACT_ORG_ID } from "./seed/ids.js";

async function main() {
  await seedNnactCatalog();
  console.log(`seed: NNACT service catalog ensured for org ${NNACT_ORG_ID}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

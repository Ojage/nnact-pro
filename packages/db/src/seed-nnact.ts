import { seedNnactDemo, verifyNnactSeed } from "./seed/nnact-demo.js";
import { seedNnactFinance, verifyNnactFinanceSeed } from "./seed/nnact-finance.js";
import { seedPlugins } from "./seed/plugins.js";

async function main() {
  await seedPlugins();
  await seedNnactDemo();
  await seedNnactFinance();
  const counts = await verifyNnactSeed();
  console.log("seed:nnact verification counts", counts);
  const financeCounts = await verifyNnactFinanceSeed();
  console.log("seed:nnact finance counts", financeCounts);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

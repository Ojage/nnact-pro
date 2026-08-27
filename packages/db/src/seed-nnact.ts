import { seedNnactDemo, verifyNnactSeed } from "./seed/nnact-demo.js";
import { seedPlugins } from "./seed/plugins.js";

async function main() {
  await seedPlugins();
  await seedNnactDemo();
  const counts = await verifyNnactSeed();
  console.log("seed:nnact verification counts", counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

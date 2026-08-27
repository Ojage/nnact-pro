// Database seed entrypoint — idempotent plugin manifests + NNACT development demo data.
import { seedPlugins } from "./seed/plugins.js";
import { seedNnactDemo, verifyNnactSeed } from "./seed/nnact-demo.js";

async function main() {
  await seedPlugins();

  const mode = process.env.SEED_MODE ?? "nnact";
  if (mode === "plugins-only") {
    console.log("seed: plugins-only mode — skipping NNACT demo data");
    process.exit(0);
  }

  await seedNnactDemo();
  const counts = await verifyNnactSeed();
  console.log("seed: NNACT verification counts", counts);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/schema.ts", "./src/service-plans.ts", "./src/diagnostics.ts", "./src/repair-brain.ts", "./src/content.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp",
  },
} satisfies Config;

import type { Config } from "drizzle-kit";

export default {
  schema: ["./src/schema.ts", "./src/service-plans.ts", "./src/diagnostics.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ofp:ofp@localhost:5432/ofp",
  },
} satisfies Config;

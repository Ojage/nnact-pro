import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { customerRoutes } from "./routes/customers.js";
import { jobRoutes } from "./routes/jobs.js";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.register(healthRoutes);
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  return app;
}

// Only listen when run directly (not when imported by tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.API_PORT ?? 3001);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { customerRoutes } from "./routes/customers.js";
import { jobRoutes } from "./routes/jobs.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { lineItemRoutes } from "./routes/lineitems.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? "change-me-in-production" });
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(jobRoutes, { prefix: "/api/jobs" });
  app.register(appointmentRoutes, { prefix: "/api/appointments" });
  app.register(lineItemRoutes, { prefix: "/api" });
  app.register(invoiceRoutes, { prefix: "/api/invoices" });
  app.register(stripeWebhookRoute, { prefix: "/api" }); // encapsulated raw-body parser
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

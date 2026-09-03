import "./env-bootstrap.js";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { customerAuthRoutes } from "./routes/customer-auth.js";
import { customerRoutes } from "./routes/customers.js";
import { jobRoutes } from "./routes/jobs.js";
import { appointmentRoutes } from "./routes/appointments.js";
import { lineItemRoutes } from "./routes/lineitems.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { stripeWebhookRoute } from "./routes/stripe-webhook.js";
import { estimateRoutes } from "./routes/estimates.js";
import { reviewRoutes } from "./routes/reviews.js";
import { reportRoutes } from "./routes/reports.js";
import { recurringRoutes } from "./routes/recurring.js";
import { publicRoutes } from "./routes/public.js";
import { portalRoutes } from "./routes/portal.js";
import { messageRoutes } from "./routes/messages.js";
import { documentRoutes } from "./routes/documents.js";
import { activityRoutes } from "./routes/activities.js";
import { syncRoutes } from "./routes/sync.js";
import { userRoutes } from "./routes/users.js";
import { photoRoutes } from "./routes/photos.js";
import { catalogRoutes } from "./routes/catalog.js";
import { equipmentRoutes } from "./routes/equipment.js";
import { notificationRoutes, pushTokenRoutes } from "./routes/notifications.js";
import { walkthroughRoutes } from "./routes/walkthroughs.js";
import { searchRoutes } from "./routes/search.js";
import { pluginRoutes } from "./routes/plugins.js";
import { pluginApiRoutes } from "./routes/plugin-api.js";
import { servicePlanRoutes } from "./routes/service-plans.js";
import { orgSettingsRoutes } from "./routes/org-settings.js";
import { operationRoutes } from "./routes/operations.js";
import { diagnosticRoutes } from "./routes/diagnostics.js";
import { diagnosticOfflineRoutes } from "./routes/diagnostic-offline.js";
import { diagnosticOutputRoutes } from "./routes/diagnostic-outputs.js";
import { voiceNoteRoutes } from "./routes/voice-notes.js";
import { repairBrainRoutes } from "./routes/repair-brain.js";
import { repairBrainIntelligenceRoutes } from "./routes/repair-brain-intelligence.js";
import { closeRedis } from "./repair-brain-cache.js";
import { passwordChangeRequiredGuard } from "./password-change-guard.js";
import { diagnosticAuthoringGuard } from "./diagnostic-authoring-guard.js";
import { repairBrainAuthorizationGuard } from "./repair-brain-authorization.js";
import { operationalAuthorizationGuard } from "./operational-authorization.js";
import { closeDocumentPdfBrowser } from "./render-document-pdf.js";
import { resolveCorsOrigin, resolveJwtSecret } from "./runtime-security.js";
import { applyApiSecurityHeaders, applyDocsSecurityHeaders } from "./security-headers.js";
import { unifiedSessionCookieAuthenticationHook } from "./customer-session-cookie.js";
import type { HealthProbes } from "./health.js";
import {
  createOperationsClient,
  type OperationsClient,
} from "./operations-client.js";
import {
  isMaintenanceExempt,
  isMutatingMethod,
  maintenanceReaderFromEnvironment,
  type MaintenanceReader,
  WorkerDrainTracker,
} from "./maintenance.js";

// API versioning constants
const API_VERSION = "v1";
const API_BASE = `/api/${API_VERSION}`;
const LEGACY_API_BASE = "/api";

function withVersion(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function withLegacy(path: string): string {
  return `${LEGACY_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildServer(
  options: {
    healthProbes?: HealthProbes;
    healthProbeTimeoutMs?: number;
    operationsClient?: OperationsClient;
    maintenanceReader?: MaintenanceReader;
  } = {},
) {
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  app.addHook("onClose", async () => {
    await closeRedis();
  });
  app.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
  app.register(jwt, {
    secret: resolveJwtSecret(),
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "12h" },
  });

  // Legacy path deprecation helper
  function addDeprecationHeader(routePrefix: string) {
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith(routePrefix)) {
        reply.header("Deprecation", "true");
        reply.header("Link", `<${withVersion(request.url.replace(routePrefix, ""))}>; rel="successor-version"; title="Version ${API_VERSION}"`);
        reply.header("Sunset", "Sat, 01 Jan 2026 00:00:00 GMT");
      }
    });
  }
  app.register(swagger, {
    openapi: {
      info: {
        title: "NNACT Pro API",
        version: "0.1.0",
        description:
          "Field-service management API for NNACT Pro. Multi-tenant, role-based access. " +
          "All endpoints require organization context via JWT or API token.",
        contact: { name: "NNACT", url: "https://nnact.com" },
        license: { name: "Proprietary" },
      },
      servers: [
        { url: `/api/${API_VERSION}`, description: `Current stable version (${API_VERSION})` },
        { url: "/api", description: "Legacy (unversioned) — deprecated, will be removed in v2" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "JWT access token from `/api/auth/login` or `/api/customer-auth/login`",
          },
          apiToken: {
            type: "apiKey",
            in: "header",
            name: "X-API-Token",
            description: "Plugin API token (org-scoped, HMAC-signed)",
          },
        },
        schemas: {
          ErrorResponse: {
            type: "object",
            properties: { error: { type: "string" } },
            required: ["error"],
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: "Auth", description: "Staff authentication (login, register, me)" },
        { name: "Customer Auth", description: "Customer portal authentication" },
        { name: "Public", description: "Unauthenticated endpoints (booking config, submit, tracking)" },
        { name: "Customers", description: "Customer CRUD" },
        { name: "Jobs", description: "Work orders (jobs) lifecycle" },
        { name: "Appointments", description: "Scheduling & technician dispatch" },
        { name: "Line Items", description: "Job line items (labor, parts, materials)" },
        { name: "Invoices", description: "Invoicing & payments" },
        { name: "Estimates", description: "Customer estimates & approval flow" },
        { name: "Portal", description: "Customer portal links & sessions" },
        { name: "Messages", description: "Email/SMS message logs & templates" },
        { name: "Documents", description: "File uploads & generated PDFs" },
        { name: "Activities", description: "Audit/activity log" },
        { name: "Sync", description: "Mobile offline sync endpoints" },
        { name: "Users", description: "Team members & roles" },
        { name: "Equipment", description: "Customer equipment registry" },
        { name: "Diagnostics", description: "Diagnostic sessions & outputs" },
        { name: "Voice Notes", description: "Audio notes on jobs" },
        { name: "Repair Brain", description: "AI-assisted troubleshooting" },
        { name: "Notifications", description: "In-app + push notifications" },
        { name: "Walkthroughs", description: "Guided onboarding walkthroughs" },
        { name: "Search", description: "Global search" },
        { name: "Plugins", description: "Plugin marketplace & webhooks" },
        { name: "Service Plans", description: "Recurring maintenance plans" },
        { name: "Org Settings", description: "Organization configuration" },
        { name: "Operations", description: "Platform operations (backup, maintenance)" },
      ],
    },
  });

  app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
    staticCSP: true,
    transformSpecification: (swaggerObject) => swaggerObject,
  });
  app.addHook("onRequest", unifiedSessionCookieAuthenticationHook);
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/docs")) {
      applyDocsSecurityHeaders(reply);
    } else {
      applyApiSecurityHeaders(reply);
    }
    return payload;
  });
  const maintenance = options.maintenanceReader ?? maintenanceReaderFromEnvironment();
  const apiDrain = new WorkerDrainTracker(maintenance);
  const activeMutations = new WeakMap<object, () => void>();
  const releaseMutation = (request: object) => {
    activeMutations.get(request)?.();
    activeMutations.delete(request);
  };
  app.addHook("preHandler", async (request, reply) => {
    if (!isMutatingMethod(request.method)) return;
    const pathname = new URL(request.raw.url ?? request.url, "http://api.internal").pathname;
    if (isMaintenanceExempt(request.method, pathname)) return;
    const finish = apiDrain.begin();
    if (!finish) {
      return reply
        .header("Cache-Control", "no-store")
        .header("Retry-After", "30")
        .code(503)
        .send({
          error: "NNACT Pro is temporarily in maintenance mode. Please try again shortly.",
          retryable: true,
        });
    }
    activeMutations.set(request, finish);
  });
  app.addHook("onResponse", async (request) => releaseMutation(request));
  app.addHook("onRequestAbort", async (request) => releaseMutation(request));
  app.addHook("preHandler", operationalAuthorizationGuard);
  app.addHook("preHandler", passwordChangeRequiredGuard);
  app.addHook("preHandler", diagnosticAuthoringGuard);
  app.addHook("preHandler", repairBrainAuthorizationGuard);

  // Register versioned API routes (v1)
  app.register(healthRoutes, { prefix: withVersion(""), probes: options.healthProbes, timeoutMs: options.healthProbeTimeoutMs });
  app.get(withVersion("/internal/drain"), async () => apiDrain.status());
  app.register(authRoutes, { prefix: withVersion("/auth") });
  app.register(customerAuthRoutes, { prefix: withVersion("/customer-auth") });
  app.register(customerRoutes, { prefix: withVersion("/customers") });
  app.register(jobRoutes, { prefix: withVersion("/jobs") });
  app.register(appointmentRoutes, { prefix: withVersion("/appointments") });
  app.register(lineItemRoutes, { prefix: withVersion("") });
  app.register(invoiceRoutes, { prefix: withVersion("/invoices") });
  app.register(stripeWebhookRoute, { prefix: withVersion("") });
  app.register(estimateRoutes, { prefix: withVersion("/estimates") });
  app.register(reviewRoutes, { prefix: withVersion("/reviews") });
  app.register(reportRoutes, { prefix: withVersion("/reports") });
  app.register(recurringRoutes, { prefix: withVersion("/recurring") });
  app.register(photoRoutes, { prefix: withVersion("/photos") });
  app.register(catalogRoutes, { prefix: withVersion("/catalog") });
  app.register(publicRoutes, { prefix: withVersion("/public") });
  app.register(portalRoutes, { prefix: withVersion("/portal") });
  app.register(messageRoutes, { prefix: withVersion("") });
  app.register(documentRoutes, { prefix: withVersion("") });
  app.register(activityRoutes, { prefix: withVersion("/activities") });
  app.register(syncRoutes, { prefix: withVersion("") });
  app.register(userRoutes, { prefix: withVersion("/users") });
  app.register(equipmentRoutes, { prefix: withVersion("/equipment") });
  app.register(diagnosticRoutes, { prefix: withVersion("/diagnostics") });
  app.register(diagnosticOfflineRoutes, { prefix: withVersion("/diagnostics") });
  app.register(diagnosticOutputRoutes, { prefix: withVersion("/diagnostics") });
  app.register(voiceNoteRoutes, { prefix: withVersion("") });
  app.register(repairBrainRoutes, { prefix: withVersion("/repair-brain") });
  app.register(repairBrainIntelligenceRoutes, { prefix: withVersion("/repair-brain") });
  app.register(notificationRoutes, { prefix: withVersion("/notifications") });
  app.register(pushTokenRoutes, { prefix: withVersion("/push-tokens") });
  app.register(walkthroughRoutes, { prefix: withVersion("/me") });
  app.register(searchRoutes, { prefix: withVersion("/search") });
  app.register(pluginRoutes, { prefix: withVersion("/plugins") });
  app.register(pluginApiRoutes, { prefix: withVersion("/plugin") });
  app.register(servicePlanRoutes, { prefix: withVersion("/service-plans") });
  app.register(orgSettingsRoutes, { prefix: withVersion("/org") });
  app.register(operationRoutes, {
    prefix: withVersion("/operations"),
    client:
      options.operationsClient ??
      createOperationsClient({
        baseUrl:
          process.env.OPERATIONS_CONTROLLER_URL ?? "http://operations-controller:3010",
        secretFile:
          process.env.OPERATIONS_CONTROLLER_SECRET_FILE ??
          "/run/secrets/openfieldpro_operations_controller",
      }),
  });

  // Legacy (unversioned) routes — deprecated, redirect with headers
  addDeprecationHeader(LEGACY_API_BASE);
  app.register(healthRoutes, { prefix: withLegacy(""), probes: options.healthProbes, timeoutMs: options.healthProbeTimeoutMs });
  app.get(withLegacy("/internal/drain"), async () => apiDrain.status());
  app.register(authRoutes, { prefix: withLegacy("/auth") });
  app.register(customerAuthRoutes, { prefix: withLegacy("/customer-auth") });
  app.register(customerRoutes, { prefix: withLegacy("/customers") });
  app.register(jobRoutes, { prefix: withLegacy("/jobs") });
  app.register(appointmentRoutes, { prefix: withLegacy("/appointments") });
  app.register(lineItemRoutes, { prefix: withLegacy("") });
  app.register(invoiceRoutes, { prefix: withLegacy("/invoices") });
  app.register(stripeWebhookRoute, { prefix: withLegacy("") });
  app.register(estimateRoutes, { prefix: withLegacy("/estimates") });
  app.register(reviewRoutes, { prefix: withLegacy("/reviews") });
  app.register(reportRoutes, { prefix: withLegacy("/reports") });
  app.register(recurringRoutes, { prefix: withLegacy("/recurring") });
  app.register(photoRoutes, { prefix: withLegacy("/photos") });
  app.register(catalogRoutes, { prefix: withLegacy("/catalog") });
  app.register(publicRoutes, { prefix: withLegacy("/public") });
  app.register(portalRoutes, { prefix: withLegacy("/portal") });
  app.register(messageRoutes, { prefix: withLegacy("") });
  app.register(documentRoutes, { prefix: withLegacy("") });
  app.register(activityRoutes, { prefix: withLegacy("/activities") });
  app.register(syncRoutes, { prefix: withLegacy("") });
  app.register(userRoutes, { prefix: withLegacy("/users") });
  app.register(equipmentRoutes, { prefix: withLegacy("/equipment") });
  app.register(diagnosticRoutes, { prefix: withLegacy("/diagnostics") });
  app.register(diagnosticOfflineRoutes, { prefix: withLegacy("/diagnostics") });
  app.register(diagnosticOutputRoutes, { prefix: withLegacy("/diagnostics") });
  app.register(voiceNoteRoutes, { prefix: withLegacy("") });
  app.register(repairBrainRoutes, { prefix: withLegacy("/repair-brain") });
  app.register(repairBrainIntelligenceRoutes, { prefix: withLegacy("/repair-brain") });
  app.register(notificationRoutes, { prefix: withLegacy("/notifications") });
  app.register(pushTokenRoutes, { prefix: withLegacy("/push-tokens") });
  app.register(walkthroughRoutes, { prefix: withLegacy("/me") });
  app.register(searchRoutes, { prefix: withLegacy("/search") });
  app.register(pluginRoutes, { prefix: withLegacy("/plugins") });
  app.register(pluginApiRoutes, { prefix: withLegacy("/plugin") });
  app.register(servicePlanRoutes, { prefix: withLegacy("/service-plans") });
  app.register(orgSettingsRoutes, { prefix: withLegacy("/org") });
  app.register(operationRoutes, {
    prefix: withLegacy("/operations"),
    client:
      options.operationsClient ??
      createOperationsClient({
        baseUrl:
          process.env.OPERATIONS_CONTROLLER_URL ?? "http://operations-controller:3010",
        secretFile:
          process.env.OPERATIONS_CONTROLLER_SECRET_FILE ??
          "/run/secrets/openfieldpro_operations_controller",
      }),
  });

  return app;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.API_PORT ?? 3001);
  void (async () => {
    try {
      const app = await buildServer();
      await app.listen({ port, host: "0.0.0.0" });
      const shutdown = async () => {
        await closeDocumentPdfBrowser().catch(() => {});
        await app.close();
        process.exit(0);
      };
      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}

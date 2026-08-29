import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, orgs, customers, properties, jobs, users } from "@nnact/db";
import {
  type PublicBookingResultDTO,
  type PublicRequestStatusDTO,
  type JobStatus,
} from "@nnact/shared";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { getOrgLogo, getOrgSignature, getOrgStamp } from "../uploads.js";
import { resolveDefaultOrgId } from "../runtime-security.js";
import { hashPortalToken } from "../portal-links.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";
import { safeNotifyUser } from "../notify-user.js";
import { sendEmail } from "../mailer.js";
import { bookingConfigForOrg, marketingProfileForOrg } from "../public-marketing.js";

const bookBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(5_000).optional(),
  serviceCategory: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  preferredDate: z.string().trim().max(40).optional(),
  preferredTime: z.string().trim().max(40).optional(),
});

const bookBodySchema = {
  type: "object",
  required: ["name", "title"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    email: { type: "string", format: "email", maxLength: 320 },
    phone: { type: "string", maxLength: 50 },
    title: { type: "string", minLength: 1, maxLength: 250 },
    description: { type: "string", maxLength: 5000 },
    serviceCategory: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 500 },
    preferredDate: { type: "string", maxLength: 40 },
    preferredTime: { type: "string", maxLength: 40 },
  },
};

const bookingConfigResponseSchema = {
  type: "object",
  properties: {
    org: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        publicEmail: { type: "string", nullable: true },
        publicPhone: { type: "string", nullable: true },
        publicAddress: { type: "string", nullable: true },
      },
    },
    serviceCategories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          services: { type: "array", items: { type: "string" } },
        },
      },
    },
    serviceAreas: { type: "array", items: { type: "string" } },
    businessHours: {
      type: "object",
      properties: {
        timezone: { type: "string" },
        workDays: { type: "array", items: { type: "string" } },
        startTime: { type: "string" },
        endTime: { type: "string" },
      },
    },
    emergencyPhone: { type: "string", nullable: true },
  },
};

const marketingProfileResponseSchema = {
  type: "object",
  properties: {
    ...bookingConfigResponseSchema.properties,
    company: {
      type: "object",
      properties: {
        legalName: { type: "string" },
        shortName: { type: "string" },
        tagline: { type: "string" },
        motto: { type: "string" },
        customerPromise: { type: "string" },
      },
    },
    brandColor: { type: "string" },
    logoUrl: { type: "string" },
    phones: { type: "array", items: { type: "string" } },
    email: { type: "string" },
    website: { type: "string" },
    featuredServices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          categoryLabel: { type: "string" },
        },
      },
    },
  },
};

const bookingResultSchema = {
  type: "object",
  required: ["ok", "requestId", "trackingToken"],
  properties: {
    ok: { type: "boolean", const: true },
    requestId: { type: "string", format: "uuid" },
    trackingToken: { type: "string", pattern: "^trk_" },
    trackingUrl: { type: "string", format: "uri", nullable: true },
    emailSent: { type: "boolean" },
  },
};

const requestStatusSchema = {
  type: "object",
  required: ["ok", "requestId", "status", "title", "customerName", "createdAt", "updatedAt"],
  properties: {
    ok: { type: "boolean", const: true },
    requestId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["lead", "scheduled", "in_progress", "completed", "canceled"] },
    title: { type: "string" },
    customerName: { type: "string" },
    serviceCategory: { type: "string", nullable: true },
    serviceAddress: { type: "string", nullable: true },
    preferredDate: { type: "string", nullable: true },
    preferredTime: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    scheduledAt: { type: "string", format: "date-time", nullable: true },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
};

const bookingRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const orgId = (request.params as { orgId?: string } | undefined)?.orgId ?? "default";
    return `${requestIpKey(request)}:${orgId}`;
  },
});

function customerAppUrl(path = ""): string {
  const base = process.env.CUSTOMER_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3002";
  return path ? `${base}${path.startsWith("/") ? path : `/${path}`}` : base;
}

function notifyStaffOfServiceRequest(orgId: string, job: typeof jobs.$inferSelect): void {
  void (async () => {
    try {
      const staff = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.orgId, orgId),
            eq(users.active, true),
            inArray(users.role, ["owner", "dispatcher"]),
          ),
        );
      await Promise.all(
        staff.map((member) =>
          safeNotifyUser(orgId, member.id, {
            type: "customer.request_received",
            title: "New service request",
            body: `${job.title}`,
            link: `/jobs/${job.id}`,
            jobId: job.id,
          }),
        ),
      );
    } catch (err) {
      console.error("[public] staff notification failed:", err);
    }
  })();
}

function sendBookingConfirmationEmail(input: {
  orgName: string;
  to: string;
  customerName: string;
  service: string;
  requestId: string;
  trackingUrl: string;
}): void {
  void (async () => {
    try {
      await sendEmail({
        to: input.to,
        subject: `We received your ${input.orgName} service request`,
        text: [
          `Hi ${input.customerName},`,
          "",
          `We've received your request for: ${input.service}`,
          `Request reference: ${input.requestId}`,
          "",
          `You can check the status of your request anytime here:`,
          input.trackingUrl,
          "",
          "Our dispatch team will reach out to confirm a time — usually within 24 hours.",
          "",
          `Thanks,`,
          input.orgName,
        ].join("\n"),
      });
    } catch (err) {
      console.error("[public] booking confirmation email failed:", err);
    }
  })();
}

async function submitPublicBooking(
  orgId: string,
  parsed: z.infer<typeof bookBody>,
  reply: FastifyReply,
): Promise<PublicBookingResultDTO | undefined> {
  const [org] = await db
    .select({ id: orgs.id, name: orgs.name, publicEmail: orgs.publicEmail })
    .from(orgs)
    .where(eq(orgs.id, orgId));
  if (!org) {
    reply.code(404).send({ error: "business not found" });
    return;
  }

  const { name, title, description, serviceCategory, address, preferredDate, preferredTime } = parsed;
  const email = parsed.email?.trim().toLowerCase() || null;
  const phone = parsed.phone?.trim() || null;

  const trackingToken = `trk_${randomBytes(24).toString("base64url")}`;
  const trackingTokenHash = hashPortalToken(trackingToken);

  const { job } = await db.transaction(async (tx) => {
    const contactClauses = [];
    if (email) contactClauses.push(eq(customers.email, email));
    if (phone) contactClauses.push(eq(customers.phone, phone));

    let customer;
    if (contactClauses.length > 0) {
      [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.orgId, orgId), or(...contactClauses)))
        .limit(1);
    }
    if (!customer) {
      [customer] = await tx.insert(customers).values({ orgId, name, email, phone }).returning();
    } else {
      [customer] = await tx
        .update(customers)
        .set({
          name: name || customer.name,
          email: email || customer.email,
          phone: phone || customer.phone,
        })
        .where(eq(customers.id, customer.id))
        .returning();
    }

    let propertyId: string | null = null;
    if (address) {
      const [existing] = await tx
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.orgId, orgId), eq(properties.customerId, customer.id), eq(properties.address, address)))
        .limit(1);
      if (existing) {
        propertyId = existing.id;
      } else {
        const [property] = await tx
          .insert(properties)
          .values({ orgId, customerId: customer.id, address })
          .returning();
        propertyId = property.id;
      }
    }

    const [createdJob] = await tx
      .insert(jobs)
      .values({
        orgId,
        customerId: customer.id,
        propertyId,
        title,
        description: description ?? null,
        status: "lead",
        source: "customer_request",
        serviceCategory: serviceCategory ?? null,
        serviceAddress: address ?? null,
        preferredDate: preferredDate ?? null,
        preferredTime: preferredTime ?? null,
        trackingTokenHash,
      })
      .returning();

    return { job: createdJob };
  });

  safeEmitActivity(orgId, "customer.request_received", `Service request received: ${job.title}`, {
    customerId: job.customerId,
    jobId: job.id,
  });
  void safeEmitEvent(orgId, "job.created", {
    id: job.id,
    title: job.title,
    customerId: job.customerId,
    status: job.status,
    source: "customer_request",
  });
  notifyStaffOfServiceRequest(orgId, job);

  let emailSent = false;
  if (email) {
    emailSent = true;
    void sendBookingConfirmationEmail({
      orgName: org.name,
      to: email,
      customerName: name,
      service: title,
      requestId: job.id,
      trackingUrl: customerAppUrl(`/track/${trackingToken}`),
    });
  }

  return {
    ok: true,
    requestId: job.id,
    trackingToken,
    trackingUrl: customerAppUrl(`/track/${trackingToken}`),
    emailSent,
  };
}

/** Resolve a tracking token that may arrive as a bare token or a pasted URL. */
function resolveTrackingToken(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("trk_")) return trimmed;
  try {
    const url = new URL(trimmed);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last?.startsWith("trk_") ? last : null;
  } catch {
    return null;
  }
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/firebase-config", async () => ({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
      (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
        : ""),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  }));

  app.get("/default", {
    schema: {
      tags: ["Public"],
      summary: "Get booking config for default organization",
      response: { 200: bookingConfigResponseSchema, 404: errorResponseSchema },
    },
    handler: async (_req, reply) => {
      const orgId = resolveDefaultOrgId();
      if (!orgId) return reply.code(404).send({ error: "default organization is not configured" });
      const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      if (!org) return reply.code(404).send({ error: "business not found" });
      return bookingConfigForOrg(org);
    },
  });

  app.get("/marketing", {
    schema: {
      tags: ["Public"],
      summary: "Get marketing profile for default organization",
      response: { 200: marketingProfileResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const orgId = resolveDefaultOrgId();
      if (!orgId) return reply.code(404).send({ error: "default organization is not configured" });
      const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      if (!org) return reply.code(404).send({ error: "business not found" });
      return marketingProfileForOrg(org, req);
    },
  });

  app.post("/default/book", {
    preHandler: bookingRateLimit,
    schema: {
      tags: ["Public"],
      summary: "Submit a service request for the default organization",
      body: bookBodySchema,
      response: { 201: bookingResultSchema, 400: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const orgId = resolveDefaultOrgId();
      if (!orgId) return reply.code(404).send({ error: "default organization is not configured" });
      const parsed = bookBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const result = await submitPublicBooking(orgId, parsed.data, reply);
      if (!result) return;
      return reply.code(201).send(result);
    },
  });

  app.get("/requests/:token", {
    schema: {
      tags: ["Public"],
      summary: "Get public service request status by tracking token",
      params: { type: "object", required: ["token"], properties: { token: { type: "string", pattern: "^trk_" } } },
      response: { 200: requestStatusSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { token } = req.params as { token: string };
      const raw = resolveTrackingToken(token);
      if (!raw) return reply.code(404).send({ error: "request not found" });

      const [job] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.trackingTokenHash, hashPortalToken(raw)))
        .limit(1);
      if (!job) return reply.code(404).send({ error: "request not found" });

      const [customer] = await db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, job.customerId))
        .limit(1);

      const status: JobStatus = job.status as JobStatus;
      return {
        ok: true,
        requestId: job.id,
        status,
        title: job.title,
        customerName: customer?.name ?? "",
        serviceCategory: job.serviceCategory,
        serviceAddress: job.serviceAddress,
        preferredDate: job.preferredDate,
        preferredTime: job.preferredTime,
        createdAt: job.createdAt.toISOString(),
        scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
        updatedAt: job.updatedAt.toISOString(),
      } satisfies PublicRequestStatusDTO;
    },
  });

  app.get("/:orgId/marketing", {
    schema: {
      tags: ["Public"],
      summary: "Get marketing profile for an organization",
      params: { type: "object", required: ["orgId"], properties: { orgId: { type: "string", format: "uuid" } } },
      response: { 200: marketingProfileResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      if (!org) return reply.code(404).send({ error: "business not found" });
      return marketingProfileForOrg(org, req);
    },
  });

  app.get("/:orgId/logo", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const logo = await getOrgLogo(orgId);
    if (!logo) return reply.code(404).send({ error: "logo not found" });
    reply.header("Cache-Control", "public, max-age=300, immutable");
    return reply.type(logo.contentType).send(logo.buffer);
  });

  app.get("/:orgId/signature", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const signature = await getOrgSignature(orgId);
    if (!signature) return reply.code(404).send({ error: "signature not found" });
    reply.header("Cache-Control", "public, max-age=300, immutable");
    return reply.type(signature.contentType).send(signature.buffer);
  });

  app.get("/:orgId/stamp", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const stamp = await getOrgStamp(orgId);
    if (!stamp) return reply.code(404).send({ error: "stamp not found" });
    reply.header("Cache-Control", "public, max-age=300, immutable");
    return reply.type(stamp.contentType).send(stamp.buffer);
  });

  app.get("/:orgId/booking", {
    schema: {
      tags: ["Public"],
      summary: "Get booking config for an organization",
      params: { type: "object", required: ["orgId"], properties: { orgId: { type: "string", format: "uuid" } } },
      response: { 200: bookingConfigResponseSchema, 404: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      if (!org) return reply.code(404).send({ error: "business not found" });
      return bookingConfigForOrg(org);
    },
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  app.post("/:orgId/book", {
    preHandler: bookingRateLimit,
    schema: {
      tags: ["Public"],
      summary: "Submit a new service request (customer booking)",
      params: { type: "object", required: ["orgId"], properties: { orgId: { type: "string", format: "uuid" } } },
      body: bookBodySchema,
      response: { 201: bookingResultSchema, 400: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema },
    },
    handler: async (req, reply) => {
      const { orgId } = req.params as { orgId: string };
      const parsed = bookBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const result = await submitPublicBooking(orgId, parsed.data, reply);
      if (!result) return;
      return reply.code(201).send(result);
    },
  });
}

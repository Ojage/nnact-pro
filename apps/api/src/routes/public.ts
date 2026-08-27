import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs, customers, jobs } from "@nnact/db";
import { mergeBusinessSettings, NNACT_COMPANY, type PublicBookingConfigDTO } from "@nnact/shared";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { getOrgLogo } from "../uploads.js";
import { resolveDefaultOrgId } from "../runtime-security.js";

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

const bookingRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const orgId = (request.params as { orgId?: string } | undefined)?.orgId ?? "unknown";
    return `${requestIpKey(request)}:${orgId}`;
  },
});

function bookingConfigForOrg(org: typeof orgs.$inferSelect): PublicBookingConfigDTO {
  const settings = mergeBusinessSettings(org.businessSettings);
  return {
    org: {
      id: org.id,
      name: org.name,
      publicEmail: org.publicEmail,
      publicPhone: org.publicPhone,
      publicAddress: org.publicAddress,
    },
    serviceCategories: NNACT_COMPANY.divisions.map((division) => ({
      id: division.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: division.name,
      services: division.services,
    })),
    serviceAreas: settings.serviceAreas.length ? settings.serviceAreas : [...NNACT_COMPANY.serviceAreas],
    businessHours: settings.businessHours,
    emergencyPhone: org.publicPhone ?? NNACT_COMPANY.contact.phones[0] ?? null,
  };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/default", async (_req, reply) => {
    const orgId = resolveDefaultOrgId();
    if (!orgId) return reply.code(404).send({ error: "default organization is not configured" });
    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return bookingConfigForOrg(org);
  });

  app.get("/:orgId/logo", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const logo = await getOrgLogo(orgId);
    if (!logo) return reply.code(404).send({ error: "logo not found" });
    reply.header("Cache-Control", "public, max-age=300, immutable");
    return reply.type(logo.contentType).send(logo.buffer);
  });

  app.get("/:orgId/booking", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return bookingConfigForOrg(org);
  });

  app.get("/:orgId", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const [org] = await db.select({ id: orgs.id, name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });
    return { org };
  });

  app.post("/:orgId/book", { preHandler: bookingRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const parsed = bookBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "business not found" });

    const { name, phone, title, description, serviceCategory, address, preferredDate, preferredTime } = parsed.data;
    const email = parsed.data.email?.toLowerCase();
    const details = [
      serviceCategory ? `Category: ${serviceCategory}` : null,
      address ? `Address: ${address}` : null,
      preferredDate ? `Preferred date: ${preferredDate}` : null,
      preferredTime ? `Preferred time: ${preferredTime}` : null,
      description ?? null,
    ].filter(Boolean).join("\n");

    const job = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({ orgId, name, email, phone }).returning();
      const [createdJob] = await tx
        .insert(jobs)
        .values({
          orgId,
          customerId: customer.id,
          title,
          description: details || undefined,
          status: "lead",
        })
        .returning();
      return createdJob;
    });

    return reply.code(201).send({ ok: true, requestId: job.id });
  });
}

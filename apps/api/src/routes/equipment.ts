import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, equipment } from "@nnact/db";
import { resolveOrgId } from "./org.js";

const createSchema = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  equipmentModelId: z.string().uuid().optional(),
  type: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  installDate: z.string().datetime().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  condition: z.string().optional(),
  lastMaintenance: z.string().datetime().optional(),
  nextMaintenance: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const patchSchema = z.object({
  customerId: z.string().uuid().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  equipmentModelId: z.string().uuid().nullable().optional(),
  type: z.string().min(1).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  assetTag: z.string().optional(),
  installDate: z.string().datetime().optional(),
  warrantyExpiry: z.string().datetime().optional(),
  condition: z.string().optional(),
  lastMaintenance: z.string().datetime().optional(),
  nextMaintenance: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { customerId?: string };
    const conditions = [eq(equipment.orgId, orgId)];
    if (query.customerId) conditions.push(eq(equipment.customerId, query.customerId));
    return db
      .select()
      .from(equipment)
      .where(and(...conditions))
      .orderBy(desc(equipment.createdAt));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { installDate, warrantyExpiry, lastMaintenance, nextMaintenance, ...rest } = parsed.data;
    const [row] = await db
      .insert(equipment)
      .values({
        orgId,
        ...rest,
        installDate: installDate ? new Date(installDate) : undefined,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : undefined,
        lastMaintenance: lastMaintenance ? new Date(lastMaintenance) : undefined,
        nextMaintenance: nextMaintenance ? new Date(nextMaintenance) : undefined,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { installDate, warrantyExpiry, lastMaintenance, nextMaintenance, ...rest } = parsed.data;
    const [row] = await db
      .update(equipment)
      .set({
        ...rest,
        ...(installDate !== undefined
          ? { installDate: installDate ? new Date(installDate) : null }
          : {}),
        ...(warrantyExpiry !== undefined
          ? { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }
          : {}),
        ...(lastMaintenance !== undefined
          ? { lastMaintenance: lastMaintenance ? new Date(lastMaintenance) : null }
          : {}),
        ...(nextMaintenance !== undefined
          ? { nextMaintenance: nextMaintenance ? new Date(nextMaintenance) : null }
          : {}),
      })
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { db, appointments, jobs, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { resolveAppointmentWindow } from "./appointment-validation.js";

const createBody = z.object({
  jobId: z.string().uuid(),
  technicianId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

// Reschedule / reassign — the backend for calendar drag-and-drop.
const patchBody = z.object({
  technicianId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

async function technicianIsAssignable(orgId: string, technicianId: string) {
  const [technician] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.orgId, orgId),
        eq(users.id, technicianId),
        eq(users.role, "technician"),
        eq(users.active, true),
      ),
    );
  return Boolean(technician);
}

export async function appointmentRoutes(app: FastifyInstance) {
  // List, optionally within [from, to] for a calendar view.
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { from, to } = req.query as { from?: string; to?: string };
    const conds = [eq(appointments.orgId, orgId)];
    if (from) conds.push(gte(appointments.startsAt, new Date(from)));
    if (to) conds.push(lte(appointments.startsAt, new Date(to)));
    return db
      .select()
      .from(appointments)
      .where(and(...conds))
      .orderBy(asc(appointments.startsAt));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { startsAt, endsAt, ...rest } = parsed.data;
    const window = resolveAppointmentWindow(
      { startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
      {},
    );
    if (!window.ok) return reply.code(400).send({ error: window.error });

    // Job must belong to this org (no cross-tenant scheduling).
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, rest.jobId)));
    if (!job) return reply.code(404).send({ error: "job not found" });

    if (rest.technicianId && !(await technicianIsAssignable(orgId, rest.technicianId))) {
      return reply
        .code(400)
        .send({ error: "technician must be an active technician in this organization" });
    }

    const [row] = await db
      .insert(appointments)
      .values({
        orgId,
        ...rest,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      })
      .returning();
    // Moving a lead onto the calendar implies it's scheduled.
    await db.update(jobs).set({ status: "scheduled" }).where(eq(jobs.id, rest.jobId));
    safeEmitActivity(
      orgId,
      "appointment.scheduled",
      `Scheduled appointment for ${window.startsAt.toLocaleString()}`,
      { jobId: rest.jobId },
    );
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [current] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id)));
    if (!current) return reply.code(404).send({ error: "not found" });

    const { technicianId, startsAt, endsAt } = parsed.data;
    if (technicianId && !(await technicianIsAssignable(orgId, technicianId))) {
      return reply
        .code(400)
        .send({ error: "technician must be an active technician in this organization" });
    }

    const window = resolveAppointmentWindow(current, { startsAt, endsAt });
    if (!window.ok) return reply.code(400).send({ error: window.error });

    const [row] = await db
      .update(appointments)
      .set({
        ...(technicianId !== undefined ? { technicianId } : {}),
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      })
      .where(and(eq(appointments.orgId, orgId), eq(appointments.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    const assignmentChanged = technicianId !== undefined && technicianId !== current.technicianId;
    const scheduleChanged =
      window.startsAt.getTime() !== current.startsAt.getTime() ||
      window.endsAt.getTime() !== current.endsAt.getTime();

    if (assignmentChanged || scheduleChanged) {
      safeEmitActivity(
        orgId,
        assignmentChanged ? "appointment.assigned" : "appointment.rescheduled",
        assignmentChanged
          ? technicianId
            ? "Appointment assigned to a technician"
            : "Appointment returned to the unassigned queue"
          : `Appointment rescheduled for ${window.startsAt.toLocaleString()}`,
        { jobId: current.jobId },
      );
    }

    return row;
  });
}

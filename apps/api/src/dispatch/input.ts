// Builds the Dispatch Agent's ranking input from the database. Everything the
// deterministic ranking needs is read here, on the server, so the agent never
// supplies technicians, availability or history of its own.
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { appointments, db, jobs, repairOutcomes, serviceVisits, technicianProfiles, technicianSkills, users } from "@nnact/db";
import type { DispatchEligibleJob, DispatchRankingInput, DispatchRankingTechnician } from "@nnact/shared";
import { buildDispatchJobFingerprint } from "./ranking.js";

/** A visit with no end time is assumed to take this long. */
const DEFAULT_VISIT_MS = 2 * 3_600_000;
const ASSIGNABLE_ROLES = ["technician", "owner"] as const;

export function dispatchAgentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISPATCH_AGENT_ENABLED === "true";
}

/** Shadow mode is the default: suggestions are logged and compared, never shown. */
export function dispatchShadowMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISPATCH_AGENT_SHADOW !== "false";
}

type JobRow = typeof jobs.$inferSelect;

export function eligibleJobFromRow(row: JobRow): DispatchEligibleJob {
  const base: Omit<DispatchEligibleJob, "fingerprint"> = {
    jobId: row.id,
    orgId: row.orgId,
    title: row.title?.slice(0, 200) ?? null,
    serviceCategory: row.serviceCategory?.slice(0, 120) ?? null,
    serviceAddress: row.serviceAddress?.slice(0, 500) ?? null,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    town: row.town?.slice(0, 120) ?? null,
    neighborhood: row.neighborhood?.slice(0, 120) ?? null,
    landmark: row.landmark?.slice(0, 500) ?? null,
    zone: row.zone?.slice(0, 120) ?? null,
    landmarkDirections: row.landmark?.slice(0, 500) ?? null,
    customerId: row.customerId ?? null,
    skillHints: [],
  };
  const withPrint = { ...base, fingerprint: "pending-fingerprint" };
  return { ...base, fingerprint: buildDispatchJobFingerprint(withPrint) };
}

/** Unassigned, open jobs of one org that the agent may rank. */
export async function loadEligibleJob(orgId: string, jobId: string): Promise<DispatchEligibleJob | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId), isNull(jobs.assignedTo), inArray(jobs.status, ["lead", "scheduled"]), eq(jobs.agentDraft, false)))
    .limit(1);
  return row ? eligibleJobFromRow(row) : null;
}

function dayBounds(at: Date): { start: Date; end: Date } {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function buildRankingInput(job: DispatchEligibleJob, now = new Date()): Promise<DispatchRankingInput> {
  const visitAt = job.scheduledAt ? new Date(job.scheduledAt) : now;
  const window = { start: visitAt, end: new Date(visitAt.getTime() + DEFAULT_VISIT_MS) };
  const day = dayBounds(visitAt);

  const staff = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.orgId, job.orgId), eq(users.active, true), inArray(users.role, [...ASSIGNABLE_ROLES])));
  if (staff.length === 0) return { job, technicians: [] };
  const ids = staff.map((user) => user.id);

  const [profiles, skills, dayAppointments, dayVisits, categoryHistory, customerHistory, outcomes] = await Promise.all([
    db.select().from(technicianProfiles).where(and(eq(technicianProfiles.orgId, job.orgId), inArray(technicianProfiles.userId, ids))),
    db
      .select({ userId: technicianSkills.userId, name: technicianSkills.name })
      .from(technicianSkills)
      .where(and(eq(technicianSkills.orgId, job.orgId), inArray(technicianSkills.userId, ids))),
    db
      .select({ technicianId: appointments.technicianId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(and(eq(appointments.orgId, job.orgId), inArray(appointments.technicianId, ids), gte(appointments.startsAt, day.start), lt(appointments.startsAt, day.end))),
    db
      .select({ technicianId: serviceVisits.technicianId, scheduledAt: serviceVisits.scheduledAt })
      .from(serviceVisits)
      .where(
        and(
          eq(serviceVisits.orgId, job.orgId),
          inArray(serviceVisits.technicianId, ids),
          gte(serviceVisits.scheduledAt, day.start),
          lt(serviceVisits.scheduledAt, day.end),
        ),
      ),
    job.serviceCategory
      ? db
          .select({ technicianId: jobs.assignedTo, count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(
            and(
              eq(jobs.orgId, job.orgId),
              inArray(jobs.assignedTo, ids),
              eq(jobs.status, "completed"),
              sql`lower(${jobs.serviceCategory}) = lower(${job.serviceCategory})`,
            ),
          )
          .groupBy(jobs.assignedTo)
      : Promise.resolve([] as Array<{ technicianId: string | null; count: number }>),
    job.customerId
      ? db
          .select({ technicianId: jobs.assignedTo, count: sql<number>`count(*)::int` })
          .from(jobs)
          .where(and(eq(jobs.orgId, job.orgId), inArray(jobs.assignedTo, ids), eq(jobs.customerId, job.customerId), eq(jobs.status, "completed")))
          .groupBy(jobs.assignedTo)
      : Promise.resolve([] as Array<{ technicianId: string | null; count: number }>),
    db
      .select({
        technicianId: repairOutcomes.technicianId,
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${repairOutcomes.outcome} = 'successful')::int`,
        partial: sql<number>`count(*) filter (where ${repairOutcomes.outcome} = 'partial')::int`,
        failed: sql<number>`count(*) filter (where ${repairOutcomes.isFailedAttempt})::int`,
      })
      .from(repairOutcomes)
      .where(and(eq(repairOutcomes.orgId, job.orgId), inArray(repairOutcomes.technicianId, ids)))
      .groupBy(repairOutcomes.technicianId),
  ]);

  const profileBy = new Map(profiles.map((profile) => [profile.userId, profile]));
  const skillsBy = new Map<string, string[]>();
  for (const skill of skills) skillsBy.set(skill.userId, [...(skillsBy.get(skill.userId) ?? []), skill.name.slice(0, 120)]);
  const countBy = (rows: Array<{ technicianId: string | null; count: number }>) => new Map(rows.map((row) => [row.technicianId, row.count]));
  const category = countBy(categoryHistory);
  const customer = countBy(customerHistory);
  const outcomeBy = new Map(outcomes.map((row) => [row.technicianId, row]));

  const technicians: DispatchRankingTechnician[] = staff.map((user) => {
    const profile = profileBy.get(user.id);
    const mine = dayAppointments.filter((appointment) => appointment.technicianId === user.id);
    const visits = dayVisits.filter((visit) => visit.technicianId === user.id);
    const hasConflict =
      mine.some((appointment) => appointment.startsAt < window.end && appointment.endsAt > window.start) ||
      visits.some((visit) => {
        if (!visit.scheduledAt) return false;
        const end = new Date(visit.scheduledAt.getTime() + DEFAULT_VISIT_MS);
        return visit.scheduledAt < window.end && end > window.start;
      });
    const outcome = outcomeBy.get(user.id);
    const quality = outcome && outcome.total > 0 ? (outcome.successful + outcome.partial * 0.5) / outcome.total : null;
    return {
      technicianId: user.id,
      name: user.name.slice(0, 160),
      homeArea: profile?.homeArea?.slice(0, 160) ?? null,
      maxDailyVisits: Math.min(50, Math.max(1, profile?.maxDailyVisits ?? 4)),
      skills: (skillsBy.get(user.id) ?? []).slice(0, 50),
      todayVisits: Math.min(100, mine.length + visits.length),
      hasConflict,
      completedSameCategory: Math.min(1000, category.get(user.id) ?? 0),
      priorCustomerVisits: Math.min(1000, customer.get(user.id) ?? 0),
      outcomeQualityScore: quality,
      outcomeFailureCount: Math.min(1000, outcome?.failed ?? 0),
    };
  });
  return { job, technicians: technicians.slice(0, 100) };
}

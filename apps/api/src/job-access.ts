import { and, eq } from "drizzle-orm";
import { db, jobs } from "@nnact/db";

export async function canAccessJob(orgId: string, jobId: string, role: string, userId: string) {
  const conditions = [eq(jobs.orgId, orgId), eq(jobs.id, jobId)];
  if (role === "technician") conditions.push(eq(jobs.assignedTo, userId));
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(and(...conditions));
  return Boolean(job);
}

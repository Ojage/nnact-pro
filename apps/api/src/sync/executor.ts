import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import * as dbSchema from "@ofp/db/schema";
import type {
  SyncOpDTO,
  SyncResultDTO,
  SyncOpTable,
  SyncErrorKind,
} from "@ofp/shared";
import type { UserRole } from "../operational-authorization.js";

type Db = NodePgDatabase<typeof dbSchema>;
type Tx = any;

export interface SyncActor {
  role: UserRole;
  userId: string;
}

function err(opId: string, kind: SyncErrorKind, message: string): SyncResultDTO {
  return { opId, ok: false, error: { kind, message } };
}

function conflict(opId: string, currentVersion: number): SyncResultDTO {
  return { opId, ok: false, conflict: { currentVersion } };
}

function classifyError(error: unknown): SyncErrorKind {
  const message = (error as Error)?.message ?? "";
  if (!message) return "unknown";
  if (/parse|validation|reference/i.test(message)) return "validation";
  if (/deadlock|lock|serialization|conflict/i.test(message)) return "retryable";
  if (/connection|closed|econnreset/i.test(message)) return "fatal";
  return "unknown";
}

const JobCreate = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(["lead", "scheduled", "in_progress", "completed", "canceled"]).default("lead"),
  scheduledAt: z.string().datetime().nullable().optional(),
  total: z.number().int().min(0).default(0),
  laborCostCents: z.number().int().min(0).default(0),
}).strict();

const LineItemCreate = z.object({
  jobId: z.string().uuid(),
  description: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().int().min(0).default(0),
  unitCost: z.number().int().min(0).default(0),
}).strict();

const InvoiceCreate = z.object({
  jobId: z.string().uuid(),
  number: z.string().min(1),
  status: z.enum(["draft", "sent", "paid", "void"]).default("draft"),
  total: z.number().int().min(0).default(0),
  dueAt: z.string().datetime().nullable().optional(),
}).strict();

const AppointmentCreate = z.object({
  jobId: z.string().uuid(),
  technicianId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict();

const CustomerCreate = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict();

const EstimateCreate = z.object({
  jobId: z.string().uuid(),
  total: z.number().int().min(0).default(0),
  accepted: z.boolean().default(false),
}).strict();

const PaymentCreate = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().int().min(1),
  method: z.enum(["manual", "card", "cash", "check"]).default("manual"),
  reference: z.string().nullable().optional(),
  paidAt: z.string().datetime().nullable().optional(),
}).strict();

function nonEmptyPartial<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().refine((value) => Object.keys(value).length > 0, "update payload cannot be empty");
}

const CREATE_SCHEMAS: Record<SyncOpTable, z.ZodTypeAny> = {
  jobs: JobCreate,
  line_items: LineItemCreate,
  invoices: InvoiceCreate,
  appointments: AppointmentCreate,
  customers: CustomerCreate,
  estimates: EstimateCreate,
  payments: PaymentCreate,
};

const UPDATE_SCHEMAS: Record<SyncOpTable, z.ZodTypeAny> = {
  jobs: nonEmptyPartial(JobCreate),
  line_items: nonEmptyPartial(LineItemCreate),
  invoices: nonEmptyPartial(InvoiceCreate),
  appointments: nonEmptyPartial(AppointmentCreate),
  customers: nonEmptyPartial(CustomerCreate),
  estimates: nonEmptyPartial(EstimateCreate),
  payments: nonEmptyPartial(PaymentCreate),
};

const TABLES: Record<SyncOpTable, any> = {
  jobs: dbSchema.jobs,
  line_items: dbSchema.lineItems,
  invoices: dbSchema.invoices,
  appointments: dbSchema.appointments,
  customers: dbSchema.customers,
  estimates: dbSchema.estimates,
  payments: dbSchema.payments,
};

async function rowBelongsToOrg(tx: Tx, tableName: string, id: string, orgId: string) {
  const { rows } = await tx.execute(
    sql`SELECT id FROM ${sql.identifier(tableName)} WHERE id = ${id} AND org_id = ${orgId} LIMIT 1`,
  );
  return rows.length > 0;
}

async function validateReferences(
  tx: Tx,
  orgId: string,
  table: SyncOpTable,
  data: Record<string, unknown>,
) {
  const checks: Array<[string, string, unknown]> = [];
  if (table === "jobs" && data.customerId) checks.push(["customers", "customerId", data.customerId]);
  if (table === "line_items" && data.jobId) checks.push(["jobs", "jobId", data.jobId]);
  if (table === "appointments" && data.jobId) checks.push(["jobs", "jobId", data.jobId]);
  if (table === "appointments" && data.technicianId) checks.push(["users", "technicianId", data.technicianId]);
  if (table === "invoices" && data.jobId) checks.push(["jobs", "jobId", data.jobId]);
  if (table === "estimates" && data.jobId) checks.push(["jobs", "jobId", data.jobId]);
  if (table === "payments" && data.invoiceId) checks.push(["invoices", "invoiceId", data.invoiceId]);

  for (const [referenceTable, field, value] of checks) {
    if (typeof value !== "string" || !(await rowBelongsToOrg(tx, referenceTable, value, orgId))) {
      throw new Error(`reference validation failed for ${field}`);
    }
  }
}

async function technicianCanApply(
  tx: Tx,
  orgId: string,
  actor: SyncActor,
  op: SyncOpDTO,
): Promise<string | null> {
  if (actor.role !== "technician") return null;

  if (op.table === "jobs") {
    const { rows } = await tx.execute(
      sql`SELECT assigned_to, status FROM jobs WHERE id = ${op.entityId} AND org_id = ${orgId} LIMIT 1`,
    );
    const current = rows[0] as { assigned_to?: string | null; status?: string } | undefined;
    if (!current) return "job not found in this organization";
    if (current.assigned_to !== actor.userId) return "job is not assigned to this technician";
    const next = op.payload.status;
    const valid =
      (current.status === "scheduled" && next === "in_progress") ||
      (current.status === "in_progress" && next === "completed");
    return valid ? null : "invalid technician job transition";
  }

  if (op.table === "line_items") {
    let jobId = op.type === "create" ? op.payload.jobId : undefined;
    if (typeof jobId !== "string") {
      const { rows } = await tx.execute(
        sql`SELECT job_id FROM line_items WHERE id = ${op.entityId} AND org_id = ${orgId} LIMIT 1`,
      );
      jobId = (rows[0] as { job_id?: string } | undefined)?.job_id;
    }
    if (typeof jobId !== "string") return "line item job not found in this organization";
    const { rows } = await tx.execute(
      sql`SELECT assigned_to FROM jobs WHERE id = ${jobId} AND org_id = ${orgId} LIMIT 1`,
    );
    const assignedTo = (rows[0] as { assigned_to?: string | null } | undefined)?.assigned_to;
    return assignedTo === actor.userId ? null : "line item job is not assigned to this technician";
  }

  return "technician is not permitted to sync this table";
}

export async function applyOps(
  db: Db,
  orgId: string,
  ops: SyncOpDTO[],
  actor: SyncActor = { role: "owner", userId: "system" },
): Promise<SyncResultDTO[]> {
  const results: SyncResultDTO[] = [];
  for (const op of ops) {
    try {
      const result = await db.transaction(async (tx) => applyOne(tx, orgId, op, actor));
      results.push(result);
    } catch (error) {
      results.push({
        opId: op.opId,
        ok: false,
        error: {
          kind: classifyError(error),
          message: (error as Error).message ?? "unknown",
        },
      });
    }
  }
  return results;
}

async function applyOne(
  tx: unknown,
  orgId: string,
  op: SyncOpDTO,
  actor: SyncActor,
): Promise<SyncResultDTO> {
  const table = TABLES[op.table];
  if (!table) return err(op.opId, "validation", `unknown table: ${op.table}`);
  const database = tx as Tx;

  const technicianDenial = await technicianCanApply(database, orgId, actor, op);
  if (technicianDenial) return err(op.opId, "validation", technicianDenial);

  if (op.type === "create") {
    const parsed = CREATE_SCHEMAS[op.table].safeParse(op.payload);
    if (!parsed.success) {
      return err(op.opId, "validation", `payload parse: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    await validateReferences(database, orgId, op.table, parsed.data as Record<string, unknown>);
    await database
      .insert(table)
      .values({ id: op.entityId, orgId, ...(parsed.data as Record<string, unknown>) })
      .execute();
    return { opId: op.opId, ok: true };
  }

  if (op.type !== "update" && op.type !== "delete") {
    return err(op.opId, "validation", `unknown op.type: ${op.type}`);
  }
  if (typeof op.baseVersion !== "number") {
    return err(op.opId, "validation", "baseVersion required for update/delete");
  }

  const { rows } = await database.execute(
    sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} AND org_id = ${orgId} LIMIT 1`,
  );
  const current = rows[0] as { version?: number } | undefined;
  if (!current) return err(op.opId, "validation", "not found in this organization");
  if (Number(current.version) !== op.baseVersion) {
    return conflict(op.opId, Number(current.version));
  }

  if (op.type === "update") {
    const parsed = UPDATE_SCHEMAS[op.table].safeParse(op.payload);
    if (!parsed.success) {
      return err(op.opId, "validation", `payload parse: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    await validateReferences(database, orgId, op.table, parsed.data as Record<string, unknown>);
    const returned = await database
      .update(table)
      .set(parsed.data as Record<string, unknown>)
      .where(
        and(
          eq(table.id, op.entityId),
          eq(table.orgId, orgId),
          eq(table.version, op.baseVersion),
        ),
      )
      .returning({ version: table.version });
    if (!Array.isArray(returned) || returned.length === 0) {
      const { rows: latestRows } = await database.execute(
        sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} AND org_id = ${orgId} LIMIT 1`,
      );
      const latest = latestRows[0] as { version?: number } | undefined;
      return latest
        ? conflict(op.opId, Number(latest.version))
        : err(op.opId, "validation", "not found in this organization");
    }
    return { opId: op.opId, ok: true };
  }

  const returned = await database
    .delete(table)
    .where(
      and(
        eq(table.id, op.entityId),
        eq(table.orgId, orgId),
        eq(table.version, op.baseVersion),
      ),
    )
    .returning({ version: table.version });
  if (!Array.isArray(returned) || returned.length === 0) {
    const { rows: latestRows } = await database.execute(
      sql`SELECT version FROM ${sql.identifier(op.table)} WHERE id = ${op.entityId} AND org_id = ${orgId} LIMIT 1`,
    );
    const latest = latestRows[0] as { version?: number } | undefined;
    return latest
      ? conflict(op.opId, Number(latest.version))
      : err(op.opId, "validation", "not found in this organization");
  }
  return { opId: op.opId, ok: true };
}

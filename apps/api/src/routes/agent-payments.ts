import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  customers,
  invoices,
  jobs,
  messageLogs,
  orgs,
  paymentReminders,
  payments,
} from "@nnact/db";
import {
  AGENT_SCOPES,
  isValidCameroonMobile,
  isAgentClaims,
  normalizePhone,
  requireAgentScope,
  type AgentScope,
  type DueInvoice,
  type PaymentReminderDTO,
} from "@nnact/shared";
import { appendEvent } from "../agent-office/events.js";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";
import { sendSmsTemplate } from "../sms/templates.js";

const AGENT = "payments-agent";
const UUID = z.string().uuid();

async function agentClaims(req: FastifyRequest, reply: FastifyReply, scopes: AgentScope[]) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "agent session required" });
    return null;
  }
  const claims = req.user;
  if (!isAgentClaims(claims) || !scopes.every((scope) => requireAgentScope(claims, AGENT, scope))) {
    await reply.code(isAgentClaims(claims) ? 403 : 401).send({ error: "payments agent token required" });
    return null;
  }
  return claims;
}

async function staff(req: FastifyRequest, reply: FastifyReply) {
  const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  if (!claims || reply.sent) return null;
  if (claims.role !== "owner" && claims.role !== "dispatcher") {
    await reply.code(403).send({ error: "only owners and dispatchers can view payment reminders" });
    return null;
  }
  return claims;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function toDTO(row: typeof paymentReminders.$inferSelect): PaymentReminderDTO {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    status: row.status,
    daysOverdue: row.daysOverdue,
    balanceCents: row.balanceCents,
    toPhone: row.toPhone,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function agentPaymentRoutes(app: FastifyInstance) {
  app.post("/agent/payments/due-invoices", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.invoicesRead]);
    if (!claims) return;
    const parsed = z.object({ limit: z.number().int().min(1).max(50).default(10) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const now = new Date();
    const rows = await db
      .select({
        invoiceId: invoices.id,
        jobId: invoices.jobId,
        number: invoices.number,
        totalCents: invoices.total,
        dueAt: invoices.dueAt,
        customerId: customers.id,
        customerName: customers.name,
        paidCents: sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)`,
      })
      .from(invoices)
      .innerJoin(jobs, eq(jobs.id, invoices.jobId))
      .leftJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(invoices.orgId, claims.orgId), eq(invoices.status, "sent"), lte(invoices.dueAt, now)))
      .limit(parsed.data.limit);
    const due: DueInvoice[] = rows
      .map((row) => {
        const balanceCents = row.totalCents - Number(row.paidCents ?? 0);
        const dueAt = row.dueAt!;
        return {
          invoiceId: row.invoiceId,
          jobId: row.jobId,
          number: row.number,
          totalCents: row.totalCents,
          balanceCents,
          dueAt: dueAt.toISOString(),
          daysOverdue: Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000)),
          customerId: row.customerId,
          customerName: row.customerName ?? "there",
        };
      })
      .filter((invoice) => invoice.balanceCents > 0);
    return { invoices: due };
  });

  app.post("/agent/payments/reminders", async (req, reply) => {
    const claims = await agentClaims(req, reply, [AGENT_SCOPES.paymentRemindersSend, AGENT_SCOPES.invoicesRead]);
    if (!claims) return;
    const parsed = z
      .object({
        invoiceId: UUID,
        runId: UUID.optional(),
        dueAt: z.string().datetime(),
        balanceCents: z.number().int().positive(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;
    const now = new Date();
    const [invoice] = await db
      .select({
        id: invoices.id,
        jobId: invoices.jobId,
        number: invoices.number,
        total: invoices.total,
        status: invoices.status,
        dueAt: invoices.dueAt,
        paidCents: sql<number>`coalesce((select sum(${payments.amount}) from ${payments} where ${payments.invoiceId} = ${invoices.id}), 0)`,
      })
      .from(invoices)
      .where(and(eq(invoices.orgId, claims.orgId), eq(invoices.id, body.invoiceId)))
      .limit(1);
    if (!invoice || invoice.status !== "sent" || !invoice.dueAt || invoice.dueAt > now) {
      return reply.code(409).send({ error: "invoice is not due" });
    }
    if (invoice.dueAt.toISOString() !== body.dueAt || invoice.total - Number(invoice.paidCents ?? 0) !== body.balanceCents) {
      return reply.code(409).send({ error: "invoice changed since it was read" });
    }

    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const [existing] = await db
      .select()
      .from(paymentReminders)
      .where(
        and(
          eq(paymentReminders.orgId, claims.orgId),
          eq(paymentReminders.invoiceId, body.invoiceId),
          gte(paymentReminders.createdAt, dayStart),
          lt(paymentReminders.createdAt, dayEnd),
        ),
      )
      .limit(1);
    if (existing) return { reminder: toDTO(existing), created: false };

    const [customer] = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone, phoneE164: customers.phoneE164 })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(eq(jobs.id, invoice.jobId))
      .limit(1);
    const phone = customer?.phoneE164 || (customer?.phone ? normalizePhone(customer.phone) : "");
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - invoice.dueAt.getTime()) / 86_400_000));
    const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, claims.orgId)).limit(1);
    const portalLink = `${process.env.PUBLIC_WEB_URL ?? "https://pro.nnact.com"}/invoices/${invoice.id}`;
    const variables = {
      companyName: org?.name ?? "NNACT Pro",
      customerName: customer?.name ?? "there",
      invoiceNumber: invoice.number,
      invoiceTotal: money(body.balanceCents),
      portalLink,
    };

    let status = "skipped";
    let error: string | null = "no valid customer phone";
    let sentAt: Date | null = null;
    let message: string | null = null;
    let messageLogId: string | null = null;
    if (customer && isValidCameroonMobile(phone)) {
      try {
        message = await sendSmsTemplate("invoice_reminder", phone, variables);
        status = "sent";
        error = null;
        sentAt = now;
        const [log] = await db
          .insert(messageLogs)
          .values({
            orgId: claims.orgId,
            kind: "invoice_reminder",
            documentId: invoice.id,
            customerId: customer.id,
            recipient: phone,
            subject: `Invoice ${invoice.number} reminder`,
            body: message,
            status: "sent",
            attempts: 1,
            sentAt: now,
            lastAttemptAt: now,
          })
          .returning({ id: messageLogs.id });
        messageLogId = log?.id ?? null;
      } catch (sendError) {
        status = "failed";
        error = sendError instanceof Error ? sendError.message.slice(0, 500) : String(sendError);
      }
    }

    const [reminder] = await db
      .insert(paymentReminders)
      .values({
        orgId: claims.orgId,
        invoiceId: body.invoiceId,
        customerId: customer?.id ?? null,
        runId: body.runId,
        toPhone: customer ? phone : null,
        templateSlug: "invoice_reminder",
        balanceCents: body.balanceCents,
        daysOverdue,
        portalLink,
        body: message,
        status,
        error,
        messageLogId,
        sentAt,
      })
      .returning();
    await appendEvent({ orgId: claims.orgId, agentId: AGENT, type: "approvals" });
    return reply.code(201).send({ reminder: toDTO(reminder!), created: true });
  });

  app.get("/payments/reminders/invoices/:invoiceId", async (req, reply) => {
    const claims = await staff(req, reply);
    if (!claims) return;
    const id = UUID.safeParse((req.params as { invoiceId?: string }).invoiceId);
    if (!id.success) return reply.code(400).send({ error: "invalid invoice id" });
    const rows = await db
      .select()
      .from(paymentReminders)
      .where(and(eq(paymentReminders.orgId, claims.orgId), eq(paymentReminders.invoiceId, id.data)))
      .orderBy(sql`${paymentReminders.createdAt} desc`)
      .limit(50);
    return { reminders: rows.map(toDTO) };
  });
}

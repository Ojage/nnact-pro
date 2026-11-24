import { and, eq, lte, sql } from "drizzle-orm";
import { db, agentLeases, invoices, paymentReminders, payments } from "@nnact/db";
import { AGENT_ID, dueInvoiceSchema } from "@nnact/shared";
import { registry, textProviderOrder } from "../../lib/ai.js";
import { registerWorkSource, type WorkSource } from "../../platform/work-source.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";

const PROMPT_VERSION = "payments-v1";

export async function processPaymentReminders(api: AgentPlatformApi, office: AgentOffice, invoiceId: string, leaseId?: string): Promise<void> {
  const [invoice] = await db.select({ id: invoices.id, orgId: invoices.orgId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return;
  const run = await office.beginRun(
    { orgId: invoice.orgId, task: "agent.payment_reminder", input: { invoiceId }, promptVersion: PROMPT_VERSION },
    { label: "Checking an overdue invoice", steps: 3, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    const due = await run.step("due", "Load due invoices", async () => {
      const result = await api.agentFetch<{ invoices: unknown[] }>("/api/v1/agent/payments/due-invoices", invoice.orgId, { limit: 50 });
      const parsed = dueInvoiceSchema.array().safeParse(result.invoices);
      if (!parsed.success) throw new Error(`invalid due invoices: ${parsed.error.message.slice(0, 300)}`);
      return parsed.data;
    });
    const target = due.find((item) => item.invoiceId === invoiceId);
    if (!target) {
      await finish({ orgId: invoice.orgId, state: "skipped", error: "invoice is no longer due", promptVersion: PROMPT_VERSION, outcome: "skipped" });
      await run.end();
      return;
    }
    await run.step("review", "Review reminder wording", async () =>
      registry.generateTextWithFallback(
        invoice.orgId,
        {
          system:
            "Review invoice reminder facts. Never change amounts, record payments, issue refunds or message customers yourself. Return a short internal note only.",
          prompt: JSON.stringify({ number: target.number, balanceCents: target.balanceCents, daysOverdue: target.daysOverdue }),
          structured: true,
          temperature: 0,
          maxTokens: 400,
          task: "agent.payment_reminder",
          runId: run.id,
        },
        await textProviderOrder(invoice.orgId),
      ),
    );
    const reminder = await run.step("remind", "Send the approved SMS reminder", () =>
      api.agentFetch<{ reminder: { id: string; status: string } }>("/api/v1/agent/payments/reminders", invoice.orgId, {
        invoiceId: target.invoiceId,
        runId: run.id,
        dueAt: target.dueAt,
        balanceCents: target.balanceCents,
      }),
    );
    await finish({
      orgId: invoice.orgId,
      state: "completed",
      output: { reminderId: reminder.reminder.id, status: reminder.reminder.status },
      promptVersion: PROMPT_VERSION,
      outcome: "success",
    });
    await run.end();
  } catch (error) {
    await finish({ orgId: invoice.orgId, state: "failed", error: (error as Error).message.slice(0, 1000), promptVersion: PROMPT_VERSION, outcome: "failure" }).catch(
      () => undefined,
    );
    await run.log("error", "payment reminder run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

export const paymentsWork: WorkSource = async (limit, now) => {
  const today = now.toISOString().slice(0, 10);
  const rows = await db
    .select({ id: invoices.id, orgId: invoices.orgId, total: invoices.total, dueAt: invoices.dueAt })
    .from(invoices)
    .where(and(eq(invoices.status, "sent"), lte(invoices.dueAt, now)))
    .limit(Math.max(limit, 50));
  const paidRows = rows.length
    ? await db
        .select({ invoiceId: payments.invoiceId, amount: payments.amount })
        .from(payments)
        .where(
          sql`${payments.invoiceId} in (${sql.join(
            rows.map((row) => sql`${row.id}`),
            sql`, `,
          )})`,
        )
    : [];
  const paid = new Map<string, number>();
  for (const row of paidRows) paid.set(row.invoiceId, (paid.get(row.invoiceId) ?? 0) + row.amount);
  const items = rows
    .filter((row) => row.total - (paid.get(row.id) ?? 0) > 0)
    .map((row) => ({
      orgId: row.orgId,
      leaseKey: `${row.id}:${today}`,
      task: "agent.payment_reminder",
      payload: { invoiceId: row.id },
    }));
  if (!items.length) return items;
  const [leased, reminded] = await Promise.all([
    db
      .select({ key: agentLeases.leaseKey })
      .from(agentLeases)
      .where(and(eq(agentLeases.agentId, AGENT_ID.payments), sql`${agentLeases.leaseKey} like '%:${today}'`)),
    db
      .select({ invoiceId: paymentReminders.invoiceId })
      .from(paymentReminders)
      .where(sql`date_trunc('day', ${paymentReminders.createdAt} at time zone 'UTC') = ${today}::date`),
  ]);
  const leasedKeys = new Set(leased.map((row) => row.key));
  const remindedIds = new Set(reminded.map((row) => row.invoiceId));
  return items.filter((item) => !leasedKeys.has(item.leaseKey) && !remindedIds.has(item.payload.invoiceId)).slice(0, limit);
};

registerWorkSource(AGENT_ID.payments, paymentsWork);

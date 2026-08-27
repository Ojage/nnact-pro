import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { db, invoices, payments } from "@nnact/db";
import { applyPayment } from "../invoicing.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";

interface CheckoutSessionPayload {
  id?: string;
  metadata?: { invoiceId?: string; orgId?: string };
  amount_total?: number | null;
  payment_status?: string;
}

export async function stripeWebhookRoute(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/stripe/webhook", async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) return reply.code(501).send({ error: "Stripe webhook not configured" });

    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") return reply.code(400).send({ error: "missing signature" });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
    } catch (error) {
      return reply.code(400).send({ error: `signature verification failed: ${(error as Error).message}` });
    }

    if (event.type !== "checkout.session.completed") return { received: true };

    const session = event.data.object as CheckoutSessionPayload;
    const invoiceId = session.metadata?.invoiceId;
    const orgId = session.metadata?.orgId;
    const amount = session.amount_total ?? 0;
    if (!invoiceId || !orgId || amount <= 0 || session.payment_status !== "paid") {
      return reply.code(400).send({ error: "completed checkout is missing verified payment metadata" });
    }

    const reference = `stripe:${event.id}`;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${reference}))`);
      const [duplicate] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoiceId), eq(payments.reference, reference)))
        .limit(1);
      if (duplicate) return { kind: "duplicate" as const };

      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
        .limit(1);
      if (!invoice) return { kind: "not-found" as const };

      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-payment:${invoiceId}`}))`);
      const prior = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoiceId)));
      const priorPaid = prior.reduce((sum, payment) => sum + payment.amount, 0);
      const remaining = invoice.total - priorPaid;
      if (amount !== remaining) {
        return { kind: "amount-mismatch" as const, expected: remaining, received: amount };
      }

      let applied;
      try {
        applied = applyPayment(invoice.total, priorPaid, amount, invoice.status);
      } catch (error) {
        return { kind: "invalid" as const, error: (error as Error).message };
      }

      await tx.insert(payments).values({
        orgId,
        invoiceId,
        amount,
        method: "card",
        reference,
      });
      await tx
        .update(invoices)
        .set({ status: applied.status })
        .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
      return { kind: "paid" as const, invoice, applied };
    });

    if (result.kind === "duplicate") return { received: true, duplicate: true };
    if (result.kind === "not-found") return reply.code(404).send({ error: "invoice not found for checkout metadata" });
    if (result.kind === "amount-mismatch") {
      return reply.code(409).send({
        error: "checkout amount does not match the current invoice balance",
        expected: result.expected,
        received: result.received,
      });
    }
    if (result.kind === "invalid") return reply.code(409).send({ error: result.error });

    safeEmitActivity(
      orgId,
      "payment.received",
      `Received card payment of $${(amount / 100).toFixed(2)} on ${result.invoice.number}`,
      { jobId: result.invoice.jobId },
    );
    void safeEmitEvent(orgId, "payment.received", {
      invoiceId,
      number: result.invoice.number,
      amount,
      method: "card",
      status: result.applied.status,
    });
    if (result.applied.status === "paid") {
      void safeEmitEvent(orgId, "invoice.paid", {
        invoiceId,
        number: result.invoice.number,
        total: result.invoice.total,
        jobId: result.invoice.jobId,
      });
    }
    return { received: true };
  });
}

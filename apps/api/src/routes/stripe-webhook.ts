import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, invoices, payments } from "@ofp/db";
import { applyPayment } from "../invoicing.js";

// Encapsulated plugin: registers a RAW body parser scoped to just this route so
// Stripe signature verification works, without changing JSON parsing elsewhere.
// Gated on STRIPE_WEBHOOK_SECRET — does nothing if unconfigured.
export async function stripeWebhookRoute(app: FastifyInstance) {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body); // keep the raw Buffer for signature verification
  });

  app.post("/stripe/webhook", async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!secret || !key) return reply.code(501).send({ error: "Stripe webhook not configured" });

    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") return reply.code(400).send({ error: "missing signature" });

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(key);
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
    } catch (e) {
      return reply.code(400).send({ error: `signature verification failed: ${(e as Error).message}` });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata?: { invoiceId?: string; orgId?: string }; amount_total?: number };
      const invoiceId = session.metadata?.invoiceId;
      const orgId = session.metadata?.orgId;
      if (invoiceId && orgId && session.amount_total) {
        const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
        if (inv) {
          const prior = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
          const priorPaid = prior.reduce((a, p) => a + p.amount, 0);
          const result = applyPayment(inv.total, priorPaid, session.amount_total, inv.status);
          await db.insert(payments).values({
            orgId,
            invoiceId,
            amount: session.amount_total,
            method: "card",
            reference: (event.data.object as { id?: string }).id ?? null,
          });
          await db.update(invoices).set({ status: result.status }).where(eq(invoices.id, invoiceId));
        }
      }
    }
    return { received: true };
  });
}

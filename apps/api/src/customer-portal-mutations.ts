import { and, eq, sql } from "drizzle-orm";
import { db, invoices, payments, estimates, estimateOptions, customerAccountLinks } from "@nnact/db";
import type { FastifyReply } from "fastify";
import { requirePortalScope, assertEstimateBelongsToCustomer, type ActivePortalLink } from "./portal-session.js";
import { activePortalLinkForCustomer } from "./customer-auth-context.js";
import { resolvePublicCustomerUrl } from "./runtime-security.js";
import { safeEmitActivity } from "./activities.js";
import { nextEstimateLifecycle, assertEstimateApprovalAllowed } from "./routes/estimates.js";
import { createDepositInvoiceTx } from "./estimate-approval.js";

export async function portalCheckoutForActiveLink(
  active: ActivePortalLink,
  invoiceId: string,
  reply: FastifyReply,
  returnUrls?: { successUrl: string; cancelUrl: string },
) {
  if (!(await requirePortalScope(active, "checkout", reply))) return null;

  const settings = active.settings;
  if (settings.portal.enabled === false || settings.portal.allowInvoicePayment === false) {
    await reply.code(403).send({ error: "online payment is not available" });
    return null;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) {
    await reply.code(501).send({
      error: "online payment is not configured",
      hint: settings.invoice.paymentInstructions,
    });
    return null;
  }

  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, active.link.orgId), eq(invoices.id, invoiceId)));
  if (!inv) {
    await reply.code(404).send({ error: "invoice not found" });
    return null;
  }
  if (inv.status === "paid" || inv.status === "void") {
    await reply.code(409).send({ error: `cannot create checkout for a ${inv.status} invoice` });
    return null;
  }

  const paidRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.orgId, active.link.orgId), eq(payments.invoiceId, inv.id)));
  const paid = paidRows.reduce((sum, row) => sum + row.amount, 0);
  const remaining = inv.total - paid;
  if (remaining <= 0) {
    await reply.code(409).send({ error: "invoice has no remaining balance" });
    return null;
  }

  const customerOrigin = resolvePublicCustomerUrl();
  const successUrl = returnUrls?.successUrl ?? `${customerOrigin}/portal?paid=1`;
  const cancelUrl = returnUrls?.cancelUrl ?? `${customerOrigin}/portal`;
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Invoice ${inv.number}` },
            unit_amount: remaining,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { invoiceId: inv.id, orgId: active.link.orgId },
    },
    { idempotencyKey: `customer-checkout:${active.link.customerId}:${inv.id}:${remaining}` },
  );
  return { url: session.url };
}

export async function portalApproveEstimateForActiveLink(
  active: ActivePortalLink,
  estimateId: string,
  body: { optionId: string; signatureName?: string },
  reply: FastifyReply,
) {
  if (!(await requirePortalScope(active, "estimates", reply))) return null;
  if (active.settings.portal.allowEstimateApproval === false) {
    await reply.code(403).send({ error: "estimate approval is disabled for this business" });
    return null;
  }

  const belongs = await assertEstimateBelongsToCustomer(active.link.orgId, active.link.customerId, estimateId);
  if (!belongs) {
    await reply.code(404).send({ error: "estimate not found" });
    return null;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-approval:${estimateId}`}))`);
    const [estimate] = await tx.select().from(estimates).where(and(eq(estimates.orgId, active.link.orgId), eq(estimates.id, estimateId)));
    if (!estimate) return { kind: "missing" as const };
    const [option] = await tx.select().from(estimateOptions).where(and(
      eq(estimateOptions.orgId, active.link.orgId),
      eq(estimateOptions.estimateId, estimateId),
      eq(estimateOptions.id, body.optionId),
    ));
    if (!option) return { kind: "option" as const };

    try {
      if (estimate.status === "approved") {
        nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
        return { kind: "approved" as const, estimate };
      }
      assertEstimateApprovalAllowed({
        status: estimate.status,
        expiresAt: estimate.expiresAt,
        signatureRequired: active.settings.estimate.signatureRequired,
        signatureName: body.signatureName,
      });
      nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
    } catch (error) {
      return { kind: "invalid" as const, error: (error as Error).message };
    }

    const now = new Date();
    await tx.update(estimates).set({
      status: "approved",
      accepted: true,
      acceptedAt: now,
      acceptedByName: body.signatureName ?? active.customer.name,
      signatureName: body.signatureName ?? active.customer.name,
      selectedOptionId: option.id,
      total: option.total,
      updatedAt: now,
    }).where(and(eq(estimates.orgId, active.link.orgId), eq(estimates.id, estimateId)));

    const deposit = await createDepositInvoiceTx(tx, {
      orgId: active.link.orgId,
      estimateId,
      estimateNumberValue: estimate.number,
      jobId: estimate.jobId,
      optionTotal: option.total,
      depositMode: active.settings.estimate.depositMode,
      depositValue: active.settings.estimate.depositValue,
      netDays: active.settings.invoice.netDays,
      invoicePrefix: active.settings.numbering.invoicePrefix,
      invoiceNextNumber: active.settings.numbering.invoiceNextNumber,
      existingDepositInvoiceId: estimate.depositInvoiceId,
    });
    const [finalEstimate] = await tx.update(estimates).set({
      depositCents: deposit.deposit,
      depositInvoiceId: deposit.invoiceId ?? estimate.depositInvoiceId,
      updatedAt: now,
    }).where(and(eq(estimates.orgId, active.link.orgId), eq(estimates.id, estimateId))).returning();
    return { kind: "approved" as const, estimate: finalEstimate, deposit };
  });

  if (result.kind === "missing") {
    await reply.code(404).send({ error: "not found" });
    return null;
  }
  if (result.kind === "option") {
    await reply.code(404).send({ error: "option not found" });
    return null;
  }
  if (result.kind === "invalid") {
    await reply.code(409).send({ error: result.error });
    return null;
  }

  const depositInvoice = "deposit" in result ? result.deposit : undefined;
  if (depositInvoice?.invoiceId) {
    safeEmitActivity(
      active.link.orgId,
      "estimate.deposit_created",
      `Created ${(depositInvoice.deposit / 100).toFixed(2)} deposit invoice for ${result.estimate.number}`,
      { jobId: result.estimate.jobId },
    );
  }
  return result.estimate;
}

export async function portalDeclineEstimateForActiveLink(
  active: ActivePortalLink,
  estimateId: string,
  reply: FastifyReply,
) {
  if (!(await requirePortalScope(active, "estimates", reply))) return null;

  const belongs = await assertEstimateBelongsToCustomer(active.link.orgId, active.link.customerId, estimateId);
  if (!belongs) {
    await reply.code(404).send({ error: "estimate not found" });
    return null;
  }

  const [estimate] = await db.update(estimates).set({ status: "declined", declinedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(estimates.orgId, active.link.orgId), eq(estimates.id, estimateId), eq(estimates.status, "sent")))
    .returning();
  if (!estimate) {
    await reply.code(409).send({ error: "estimate cannot be declined" });
    return null;
  }
  return estimate;
}

export async function resolveCustomerActiveLink(accountId: string, orgId: string) {
  const [link] = await db
    .select()
    .from(customerAccountLinks)
    .where(and(eq(customerAccountLinks.accountId, accountId), eq(customerAccountLinks.orgId, orgId)))
    .limit(1);
  if (!link) return null;
  return activePortalLinkForCustomer(orgId, link.customerId);
}

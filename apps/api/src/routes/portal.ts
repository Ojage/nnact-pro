// Customer portal links. Owner routes (session-authenticated) create, list, and
// revoke links; token routes are anonymous and are authorized by the bearer
// token itself, which is stored only as a SHA-256 hash.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  portalLinks,
  customers,
  orgs,
  invoices,
  payments,
  estimates,
  estimateOptions,
} from "@nnact/db";
import { mergeBusinessSettings, type PortalLinkScope } from "@nnact/shared";
import {
  DEFAULT_PORTAL_LINK_TTL_DAYS,
  decryptPortalToken,
  encryptPortalToken,
  generatePortalToken,
  hashPortalToken,
  parsePortalLinkScopes,
  portalLinkEncryptionKey,
  portalLinkExpiry,
  portalLinkStatus,
} from "../portal-links.js";
import {
  assertEstimateBelongsToCustomer,
  assertPortalLinkActive,
  buildPortalSession,
  requirePortalScope,
  resolveActivePortalLink,
  touchPortalLink,
} from "../portal-session.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { resolveJwtSecret, resolvePublicCustomerUrl } from "../runtime-security.js";
import { resolveOrgId } from "./org.js";
import { safeEmitActivity } from "../activities.js";
import { renderMessageTemplate } from "../message-templates.js";
import { resolveSmtpConfig, sendEmail } from "../mailer.js";
import { nextEstimateLifecycle } from "./estimates.js";
import { createDepositInvoiceTx } from "../estimate-approval.js";

const createLinkBody = z.object({
  customerId: z.string().uuid(),
  scopes: z.array(z.enum(["balance", "checkout", "receipts", "service_plans", "estimates", "service_history"])).min(1),
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
});

const checkoutBody = z.object({ invoiceId: z.string().uuid() });
const portalEstimateDecisionBody = z.object({
  optionId: z.string().uuid(),
  signatureName: z.string().trim().max(160).optional(),
});

function portalLinkRow(row: typeof portalLinks.$inferSelect) {
  return {
    id: row.id,
    customerId: row.customerId,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    sentCount: row.sentCount,
    lastSentAt: row.lastSentAt,
    createdAt: row.createdAt,
  };
}

const portalSessionRateLimit = createFixedWindowRateLimit({
  max: 60,
  windowMs: 60 * 1000,
  key: (request: FastifyRequest) => `${requestIpKey(request)}:portal`,
});

const portalCheckoutRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 10 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const token = (request.params as { token?: string } | undefined)?.token ?? "unknown";
    return `${requestIpKey(request)}:${token}`;
  },
});

function assertEstimateApprovalAllowed(input: {
  status: string;
  expiresAt: Date | null;
  signatureRequired: boolean;
  signatureName?: string | null;
}) {
  if (input.status !== "sent") throw new Error("only sent estimates can be approved from the portal");
  if (input.expiresAt && input.expiresAt.getTime() < Date.now()) throw new Error("estimate has expired");
  if (input.signatureRequired && !input.signatureName?.trim()) throw new Error("signature is required to approve this estimate");
}

export async function portalRoutes(app: FastifyInstance) {
  // ---- Owner management ---------------------------------------------------
  app.get("/links", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { customerId } = req.query as { customerId?: string };
    if (!customerId) return reply.code(400).send({ error: "customerId query parameter is required" });
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });

    const rows = await db
      .select()
      .from(portalLinks)
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.customerId, customerId)))
      .orderBy(desc(portalLinks.createdAt));
    return rows.map(portalLinkRow);
  });

  app.post("/links", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createLinkBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, parsed.data.customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });

    const scopes = parsePortalLinkScopes(parsed.data.scopes) as PortalLinkScope[];
    if (scopes.length === 0) return reply.code(400).send({ error: "at least one portal view is required" });

    const generated = generatePortalToken();
    const ttl = parsed.data.expiresInDays ?? DEFAULT_PORTAL_LINK_TTL_DAYS;
    const tokenCipher = encryptPortalToken(generated.token, portalLinkEncryptionKey(resolveJwtSecret()));
    const [row] = await db
      .insert(portalLinks)
      .values({
        orgId,
        customerId: customer.id,
        tokenHash: generated.tokenHash,
        tokenPrefix: generated.tokenPrefix,
        tokenCipher,
        scopes,
        expiresAt: portalLinkExpiry(ttl),
      })
      .returning();

    safeEmitActivity(
      orgId,
      "portal.link_created",
      `Created a customer portal link for ${customer.name} (${scopes.join(", ")})`,
      {},
    );
    return reply.code(201).send({ link: portalLinkRow(row), token: generated.token, ttlDays: ttl });
  });

  app.post("/links/:id/revoke", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(portalLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "portal link not found" });
    safeEmitActivity(orgId, "portal.link_revoked", `Revoked a customer portal link (${row.tokenPrefix})`, {});
    return { ok: true };
  });

  app.post("/links/:id/send", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };

    const [link] = await db
      .select()
      .from(portalLinks)
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)));
    if (!link) return reply.code(404).send({ error: "portal link not found" });
    const status = portalLinkStatus(link);
    if (status !== "active") {
      return reply.code(409).send({ error: `cannot email a portal link that ${status === "revoked" ? "has been revoked" : "has expired"}` });
    }
    if (!link.tokenCipher) {
      return reply.code(409).send({ error: "this link predates secure re-sending; create a new portal link" });
    }
    const token = decryptPortalToken(link.tokenCipher, portalLinkEncryptionKey(resolveJwtSecret()));
    if (!token) return reply.code(409).send({ error: "this portal link cannot be recovered for sending; create a new link" });

    const [customer] = await db
      .select({ name: customers.name, email: customers.email })
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, link.customerId)));
    if (!customer) return reply.code(404).send({ error: "customer not found" });
    if (!customer.email) return reply.code(409).send({ error: `customer ${customer.name} has no email address on file` });

    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!org) return reply.code(404).send({ error: "organization not found" });
    const settings = mergeBusinessSettings(org.businessSettings);
    const smtp = resolveSmtpConfig();
    if (!smtp) {
      return reply.code(501).send({
        error: "email is not configured",
        hint: "Set SMTP_HOST, SMTP_USER, and SMTP_PASS (plus SMTP_FROM) to email portal links.",
      });
    }

    const customerOrigin = resolvePublicCustomerUrl();
    const portalUrl = `${customerOrigin}/p/${token}`;
    const variables = {
      companyName: org.name,
      customerName: customer.name,
      portalLink: portalUrl,
      portalExpiresAt: link.expiresAt
        ? new Date(link.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : null,
    };
    const subject = renderMessageTemplate(settings.messages.portalLinkSubject, variables);
    const body = renderMessageTemplate(settings.messages.portalLinkBody, variables);

    const result = await sendEmail({ to: customer.email, subject, text: body });
    if (!result) return reply.code(501).send({ error: "email is not configured" });

    await db
      .update(portalLinks)
      .set({ sentCount: link.sentCount + 1, lastSentAt: new Date() })
      .where(and(eq(portalLinks.orgId, orgId), eq(portalLinks.id, id)));
    safeEmitActivity(
      orgId,
      "portal.link_sent",
      `Emailed the customer portal link to ${customer.name} (${customer.email})`,
      {},
    );
    return { ok: true, to: customer.email, messageId: result.messageId, sentAt: new Date().toISOString() };
  });

  // ---- Anonymous token routes ---------------------------------------------
  app.get("/:token", { preHandler: portalSessionRateLimit }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const active = await resolveActivePortalLink(token);
    if (!active) {
      const tokenHash = hashPortalToken(token);
      const [link] = await db.select().from(portalLinks).where(eq(portalLinks.tokenHash, tokenHash)).limit(1);
      if (!link) return reply.code(404).send({ error: "portal link not found" });
      const status = portalLinkStatus(link);
      if (status !== "active") {
        return reply.code(410).send({ error: `portal link ${status === "revoked" ? "has been revoked" : "has expired"}` });
      }
      const [org] = await db.select().from(orgs).where(eq(orgs.id, link.orgId));
      const settings = mergeBusinessSettings(org?.businessSettings);
      if (settings.portal.enabled === false) {
        return reply.code(410).send({ error: "customer portal is disabled by the service company" });
      }
      return reply.code(410).send({ error: "this portal link does not grant any views" });
    }

    await touchPortalLink(active.link.id);
    const session = await buildPortalSession(active);
    if (!session) return reply.code(410).send({ error: "this portal link does not grant any views" });
    return session;
  });

  app.post("/:token/checkout", { preHandler: portalCheckoutRateLimit }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = checkoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const active = await resolveActivePortalLink(token);
    if (!assertPortalLinkActive(active, reply)) return;
    if (!(await requirePortalScope(active!, "checkout", reply))) return;

    const settings = active!.settings;
    if (settings.portal.enabled === false || settings.portal.allowInvoicePayment === false) {
      return reply.code(403).send({ error: "online payment is not available for this portal link" });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !webhookSecret) {
      return reply.code(501).send({
        error: "online payment is not configured",
        hint: settings.invoice.paymentInstructions,
      });
    }

    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, active!.link.orgId), eq(invoices.id, parsed.data.invoiceId)));
    if (!inv) return reply.code(404).send({ error: "invoice not found" });
    if (inv.status === "paid" || inv.status === "void") {
      return reply.code(409).send({ error: `cannot create checkout for a ${inv.status} invoice` });
    }
    const paidRows = await db
      .select({ amount: payments.amount })
      .from(payments)
      .where(and(eq(payments.orgId, active!.link.orgId), eq(payments.invoiceId, inv.id)));
    const paid = paidRows.reduce((sum, p) => sum + p.amount, 0);
    const remaining = inv.total - paid;
    if (remaining <= 0) return reply.code(409).send({ error: "invoice has no remaining balance" });

    const customerOrigin = resolvePublicCustomerUrl();
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
        success_url: `${customerOrigin}/p/${token}?paid=1`,
        cancel_url: `${customerOrigin}/p/${token}`,
        metadata: { invoiceId: inv.id, orgId: active!.link.orgId },
      },
      { idempotencyKey: `portal-checkout:${token}:${inv.id}:${remaining}` },
    );
    return { url: session.url };
  });

  app.post("/:token/estimates/:estimateId/approve", { preHandler: portalCheckoutRateLimit }, async (req, reply) => {
    const { token, estimateId } = req.params as { token: string; estimateId: string };
    const parsed = portalEstimateDecisionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const active = await resolveActivePortalLink(token);
    if (!assertPortalLinkActive(active, reply)) return;
    if (!(await requirePortalScope(active!, "estimates", reply))) return;
    if (active!.settings.portal.allowEstimateApproval === false) {
      return reply.code(403).send({ error: "estimate approval is disabled for this business" });
    }

    const belongs = await assertEstimateBelongsToCustomer(active!.link.orgId, active!.link.customerId, estimateId);
    if (!belongs) return reply.code(404).send({ error: "estimate not found" });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`estimate-approval:${estimateId}`}))`);
      const [estimate] = await tx.select().from(estimates).where(and(eq(estimates.orgId, active!.link.orgId), eq(estimates.id, estimateId)));
      if (!estimate) return { kind: "missing" as const };
      const [option] = await tx.select().from(estimateOptions).where(and(
        eq(estimateOptions.orgId, active!.link.orgId),
        eq(estimateOptions.estimateId, estimateId),
        eq(estimateOptions.id, parsed.data.optionId),
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
          signatureRequired: active!.settings.estimate.signatureRequired,
          signatureName: parsed.data.signatureName,
        });
        nextEstimateLifecycle(estimate.status, estimate.selectedOptionId, option.id);
      } catch (error) {
        return { kind: "invalid" as const, error: (error as Error).message };
      }

      const now = new Date();
      const [approved] = await tx.update(estimates).set({
        status: "approved",
        accepted: true,
        acceptedAt: now,
        acceptedByName: parsed.data.signatureName ?? active!.customer.name,
        signatureName: parsed.data.signatureName ?? active!.customer.name,
        selectedOptionId: option.id,
        total: option.total,
        updatedAt: now,
      }).where(and(eq(estimates.orgId, active!.link.orgId), eq(estimates.id, estimateId))).returning();

      const deposit = await createDepositInvoiceTx(tx, {
        orgId: active!.link.orgId,
        estimateId,
        estimateNumberValue: estimate.number,
        jobId: estimate.jobId,
        optionTotal: option.total,
        depositMode: active!.settings.estimate.depositMode,
        depositValue: active!.settings.estimate.depositValue,
        netDays: active!.settings.invoice.netDays,
        invoicePrefix: active!.settings.numbering.invoicePrefix,
        invoiceNextNumber: active!.settings.numbering.invoiceNextNumber,
        existingDepositInvoiceId: estimate.depositInvoiceId,
      });
      const [finalEstimate] = await tx.update(estimates).set({
        depositCents: deposit.deposit,
        depositInvoiceId: deposit.invoiceId ?? estimate.depositInvoiceId,
        updatedAt: now,
      }).where(and(eq(estimates.orgId, active!.link.orgId), eq(estimates.id, estimateId))).returning();
      return { kind: "approved" as const, estimate: finalEstimate, deposit };
    });

    if (result.kind === "missing") return reply.code(404).send({ error: "not found" });
    if (result.kind === "option") return reply.code(404).send({ error: "option not found" });
    if (result.kind === "invalid") return reply.code(409).send({ error: result.error });
    const depositInvoice = "deposit" in result ? result.deposit : undefined;
    if (depositInvoice?.invoiceId) {
      safeEmitActivity(
        active!.link.orgId,
        "estimate.deposit_created",
        `Created ${(depositInvoice.deposit / 100).toFixed(2)} deposit invoice for ${result.estimate.number}`,
        { jobId: result.estimate.jobId },
      );
    }
    return result.estimate;
  });

  app.post("/:token/estimates/:estimateId/decline", { preHandler: portalCheckoutRateLimit }, async (req, reply) => {
    const { token, estimateId } = req.params as { token: string; estimateId: string };
    const active = await resolveActivePortalLink(token);
    if (!assertPortalLinkActive(active, reply)) return;
    if (!(await requirePortalScope(active!, "estimates", reply))) return;

    const belongs = await assertEstimateBelongsToCustomer(active!.link.orgId, active!.link.customerId, estimateId);
    if (!belongs) return reply.code(404).send({ error: "estimate not found" });

    const [estimate] = await db.update(estimates).set({ status: "declined", declinedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(estimates.orgId, active!.link.orgId), eq(estimates.id, estimateId), eq(estimates.status, "sent")))
      .returning();
    if (!estimate) return reply.code(409).send({ error: "estimate cannot be declined" });
    return estimate;
  });
}

import type { FastifyReply } from "fastify";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  portalLinks,
  customers,
  orgs,
  invoices,
  payments,
  jobs,
  estimates,
  estimateOptions,
  servicePlans,
  customerServicePlans,
  servicePlanVisits,
} from "@nnact/db";
import { mergeBusinessSettings, type PortalLinkScope, type PortalSessionDTO } from "@nnact/shared";
import { hashPortalToken, parsePortalLinkScopes, portalLinkStatus } from "./portal-links.js";

export interface ActivePortalLink {
  link: typeof portalLinks.$inferSelect;
  org: typeof orgs.$inferSelect;
  customer: { name: string; email: string | null; phone: string | null };
  settings: ReturnType<typeof mergeBusinessSettings>;
  scopes: PortalLinkScope[];
}

export async function resolveActivePortalLink(token: string): Promise<ActivePortalLink | null> {
  const tokenHash = hashPortalToken(token);
  const [link] = await db.select().from(portalLinks).where(eq(portalLinks.tokenHash, tokenHash)).limit(1);
  if (!link || portalLinkStatus(link) !== "active") return null;

  const [org] = await db.select().from(orgs).where(eq(orgs.id, link.orgId));
  if (!org) return null;

  const settings = mergeBusinessSettings(org.businessSettings);
  if (settings.portal.enabled === false) return null;

  const [customer] = await db
    .select({ name: customers.name, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.orgId, link.orgId), eq(customers.id, link.customerId)));
  if (!customer) return null;

  const scopes = parsePortalLinkScopes(link.scopes);
  if (scopes.length === 0) return null;

  return { link, org, customer, settings, scopes };
}

export function assertPortalLinkActive(link: ActivePortalLink | null, reply: FastifyReply) {
  if (!link) {
    reply.code(404).send({ error: "portal link not found" });
    return false;
  }
  return true;
}

export async function touchPortalLink(linkId: string) {
  if (linkId === "account") return;
  await db.update(portalLinks).set({ lastUsedAt: new Date() }).where(eq(portalLinks.id, linkId));
}

async function customerJobIds(orgId: string, customerId: string) {
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.customerId, customerId)));
  return rows.map((row) => row.id);
}

export async function buildPortalSession(input: ActivePortalLink): Promise<PortalSessionDTO | null> {
  const { link, org, customer, settings, scopes } = input;
  const jobIds = await customerJobIds(link.orgId, link.customerId);

  const invoiceViews = settings.portal.allowInvoicePayment !== false;
  const views: PortalLinkScope[] = [];
  if (invoiceViews) {
    if (scopes.includes("balance")) views.push("balance");
    if (scopes.includes("checkout")) views.push("checkout");
    if (scopes.includes("receipts")) views.push("receipts");
  }
  if (scopes.includes("service_plans")) views.push("service_plans");
  if (scopes.includes("estimates") && settings.portal.allowEstimateApproval !== false) views.push("estimates");
  if (scopes.includes("service_history") && settings.portal.allowServiceHistory !== false) views.push("service_history");
  if (views.length === 0) return null;

  const balanceInvoices: PortalSessionDTO["balance"]["invoices"] = [];
  const receipts: PortalSessionDTO["receipts"] = [];

  if (invoiceViews && jobIds.length > 0) {
    const orgInvoices = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, link.orgId), inArray(invoices.jobId, jobIds)))
      .orderBy(desc(invoices.createdAt));

    for (const inv of orgInvoices) {
      const paidRows = await db
        .select({ amount: payments.amount, method: payments.method, paidAt: payments.paidAt })
        .from(payments)
        .where(and(eq(payments.orgId, link.orgId), eq(payments.invoiceId, inv.id)))
        .orderBy(asc(payments.paidAt));
      const paid = paidRows.reduce((sum, p) => sum + p.amount, 0);
      const remaining = inv.total - paid;

      if (remaining > 0 && inv.status === "sent" && scopes.includes("balance")) {
        balanceInvoices.push({
          id: inv.id,
          number: inv.number,
          total: inv.total,
          paid,
          remaining,
          dueAt: inv.dueAt ? inv.dueAt.toISOString() : null,
        });
      }

      if (scopes.includes("receipts") && inv.status === "paid") {
        receipts.push({
          id: inv.id,
          number: inv.number,
          total: inv.total,
          paidAt: paidRows.length ? paidRows[paidRows.length - 1].paidAt.toISOString() : null,
          payments: paidRows.map((p) => ({ amount: p.amount, method: p.method, paidAt: p.paidAt.toISOString() })),
        });
      }
    }
  }

  const planViews: PortalSessionDTO["servicePlans"] = [];
  if (scopes.includes("service_plans")) {
    const enrollments = await db
      .select()
      .from(customerServicePlans)
      .where(and(eq(customerServicePlans.orgId, link.orgId), eq(customerServicePlans.customerId, link.customerId), eq(customerServicePlans.status, "active")))
      .orderBy(asc(customerServicePlans.createdAt));

    for (const enrollment of enrollments) {
      const [plan] = await db
        .select({ name: servicePlans.name })
        .from(servicePlans)
        .where(and(eq(servicePlans.orgId, link.orgId), eq(servicePlans.id, enrollment.servicePlanId)));
      const [nextVisit] = await db
        .select({ title: servicePlanVisits.title, dueAt: servicePlanVisits.dueAt, status: servicePlanVisits.status })
        .from(servicePlanVisits)
        .where(and(eq(servicePlanVisits.orgId, link.orgId), eq(servicePlanVisits.customerServicePlanId, enrollment.id), eq(servicePlanVisits.status, "planned")))
        .orderBy(asc(servicePlanVisits.dueAt))
        .limit(1);
      planViews.push({
        id: enrollment.id,
        planName: plan?.name ?? "Service plan",
        status: enrollment.status,
        visitsIncluded: enrollment.visitsIncluded,
        visitsCompleted: enrollment.visitsCompleted,
        renewsAt: enrollment.renewsAt ? enrollment.renewsAt.toISOString() : null,
        nextVisit: nextVisit
          ? { title: nextVisit.title, dueAt: nextVisit.dueAt ? nextVisit.dueAt.toISOString() : null, status: nextVisit.status }
          : null,
      });
    }
  }

  const estimateViews: PortalSessionDTO["estimates"] = [];
  if (scopes.includes("estimates") && settings.portal.allowEstimateApproval !== false && jobIds.length > 0) {
    const sentEstimates = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.orgId, link.orgId), inArray(estimates.jobId, jobIds), eq(estimates.status, "sent")))
      .orderBy(desc(estimates.createdAt));

    for (const estimate of sentEstimates) {
      const options = await db
        .select({ id: estimateOptions.id, label: estimateOptions.label, total: estimateOptions.total, position: estimateOptions.position })
        .from(estimateOptions)
        .where(and(eq(estimateOptions.orgId, link.orgId), eq(estimateOptions.estimateId, estimate.id)))
        .orderBy(asc(estimateOptions.position));
      estimateViews.push({
        id: estimate.id,
        number: estimate.number,
        status: estimate.status,
        total: estimate.total,
        expiresAt: estimate.expiresAt ? estimate.expiresAt.toISOString() : null,
        options,
      });
    }
  }

  const serviceHistory: PortalSessionDTO["serviceHistory"] = [];
  if (scopes.includes("service_history") && settings.portal.allowServiceHistory !== false) {
    const historyRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        scheduledAt: jobs.scheduledAt,
        updatedAt: jobs.updatedAt,
        total: jobs.total,
      })
      .from(jobs)
      .where(and(eq(jobs.orgId, link.orgId), eq(jobs.customerId, link.customerId)))
      .orderBy(desc(jobs.createdAt))
      .limit(50);

    for (const row of historyRows) {
      serviceHistory.push({
        id: row.id,
        title: row.title,
        status: row.status,
        scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
        completedAt: row.status === "completed" ? row.updatedAt.toISOString() : null,
        total: row.total,
      });
    }
  }

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  const totalRemaining = balanceInvoices.reduce((sum, inv) => sum + inv.remaining, 0);

  return {
    org: {
      id: org.id,
      name: org.name,
      logoUrl: org.logoUrl,
      publicEmail: org.publicEmail,
      publicPhone: org.publicPhone,
      publicAddress: org.publicAddress,
      sponsorEnabled: settings.portal.showSponsorSlot !== false,
    },
    customer,
    views,
    balance: {
      invoices: balanceInvoices,
      totalRemaining,
      paymentInstructions: settings.invoice.paymentInstructions,
    },
    checkout: {
      available: invoiceViews && stripeConfigured && settings.payments.onlinePaymentsEnabled !== false,
      totalRemaining,
    },
    receipts,
    servicePlans: planViews,
    estimates: estimateViews,
    serviceHistory,
  };
}

export async function requirePortalScope(
  active: ActivePortalLink,
  scope: PortalLinkScope,
  reply: FastifyReply,
): Promise<boolean> {
  if (!active.scopes.includes(scope)) {
    reply.code(403).send({ error: `this portal link does not allow ${scope.replace("_", " ")}` });
    return false;
  }
  return true;
}

export async function assertEstimateBelongsToCustomer(orgId: string, customerId: string, estimateId: string) {
  const [row] = await db
    .select({ estimateId: estimates.id })
    .from(estimates)
    .innerJoin(jobs, eq(estimates.jobId, jobs.id))
    .where(and(eq(estimates.orgId, orgId), eq(estimates.id, estimateId), eq(jobs.customerId, customerId)))
    .limit(1);
  return row ?? null;
}

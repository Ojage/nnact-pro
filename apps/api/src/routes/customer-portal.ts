import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  orgs,
  customers,
  properties,
  jobs,
  jobStatusHistory,
  lineItems,
  appointments,
  users,
  estimates,
  estimateOptions,
  estimateOptionLineItems,
  invoices,
  invoiceLineItems,
  payments,
  equipment,
  reviews,
  serviceAgreements,
  serviceVisits,
  messageLogs,
  photos,
  customerAccounts,
  customerAccountLinks,
  customerPortalPreferences,
  customerAppointmentRequests,
  customerSupportRequests,
  customerNotificationReads,
} from "@nnact/db";
import { formatMoney, mergeBusinessSettings, validatePasswordStrength, type CurrencyCode } from "@nnact/shared";
import { hashPassword, verifyPassword, isCustomerClaims, type CustomerJwtClaims } from "../auth.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { revokeAllRefreshTokens } from "../refresh-tokens.js";
import { safeEmitActivity } from "../activities.js";
import { safeNotifyUser } from "../notify-user.js";
import { ensureEstimateDocument, ensureInvoiceDocument } from "../documents.js";
import { getPhotoFile } from "../uploads.js";

const propertyBody = z.object({
  address: z.string().trim().min(3).max(300),
  lat: z.string().trim().max(40).optional(),
  lng: z.string().trim().max(40).optional(),
});

const profileBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  company: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

const appointmentRequestBody = z.object({
  requestedStartsAt: z.string().datetime().optional(),
  reason: z.string().trim().max(1000).optional(),
});

const supportBody = z.object({
  kind: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(3).max(5000),
  jobId: z.string().uuid().optional(),
});

const reviewBody = z.object({
  jobId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).optional(),
});

const preferencesBody = z.object({
  emailUpdates: z.boolean().optional(),
  smsUpdates: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  language: z.string().trim().min(2).max(10).optional(),
});

const notificationReadBody = z.object({
  keys: z.array(z.string().trim().min(1).max(300)).max(200).optional(),
});

const writeRateLimit = createFixedWindowRateLimit({
  max: 40,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => `${requestIpKey(request)}:customer-portal-write`,
});

type CustomerContext = {
  claims: CustomerJwtClaims;
  account: typeof customerAccounts.$inferSelect;
  link: typeof customerAccountLinks.$inferSelect;
  customer: typeof customers.$inferSelect;
  org: typeof orgs.$inferSelect;
  currency: CurrencyCode;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function isoRequired(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function resolveClaims(app: FastifyInstance, req: FastifyRequest, allowQueryToken = false): Promise<CustomerJwtClaims | null> {
  const header = req.headers.authorization;
  const queryToken = allowQueryToken ? (req.query as { access_token?: string } | undefined)?.access_token : undefined;
  let decoded: unknown;
  if (header?.startsWith("Bearer ")) {
    try {
      decoded = await req.jwtVerify();
    } catch {
      return null;
    }
  } else if (queryToken) {
    try {
      decoded = app.jwt.verify(queryToken);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  return isCustomerClaims(decoded) ? decoded : null;
}

async function resolveContext(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, orgId: string, allowQueryToken = false): Promise<CustomerContext | null> {
  const claims = await resolveClaims(app, req, allowQueryToken);
  if (!claims) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const [link] = await db
    .select()
    .from(customerAccountLinks)
    .where(and(eq(customerAccountLinks.accountId, claims.accountId), eq(customerAccountLinks.orgId, orgId)))
    .limit(1);
  if (!link) {
    reply.code(404).send({ error: "customer account not linked to this organization" });
    return null;
  }
  const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, claims.accountId)).limit(1);
  const [customer] = await db.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.id, link.customerId))).limit(1);
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!account?.active || !customer || !org) {
    reply.code(401).send({ error: "invalid customer session" });
    return null;
  }
  const settings = mergeBusinessSettings(org.businessSettings);
  return { claims, account, link, customer, org, currency: settings.currency };
}

function orgDto(ctx: CustomerContext) {
  return {
    id: ctx.org.id,
    name: ctx.org.name,
    logoUrl: ctx.org.logoUrl,
    publicEmail: ctx.org.publicEmail,
    publicPhone: ctx.org.publicPhone,
    publicAddress: ctx.org.publicAddress,
    currency: ctx.currency,
  };
}

function customerDto(ctx: CustomerContext) {
  return {
    id: ctx.customer.id,
    name: ctx.customer.name,
    email: ctx.customer.email,
    phone: ctx.customer.phone,
    company: ctx.customer.company,
    address: ctx.customer.address,
  };
}

function profileDto(ctx: CustomerContext) {
  return {
    account: { id: ctx.account.id, name: ctx.account.name, email: ctx.account.email, phone: ctx.account.phone },
    customer: customerDto(ctx),
    org: orgDto(ctx),
  };
}

async function paidByInvoice(orgId: string, invoiceIds: string[]) {
  const map = new Map<string, number>();
  if (invoiceIds.length === 0) return map;
  const rows = await db
    .select({ invoiceId: payments.invoiceId, amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), inArray(payments.invoiceId, invoiceIds)));
  for (const row of rows) map.set(row.invoiceId, (map.get(row.invoiceId) ?? 0) + row.amount);
  return map;
}

async function loadInvoiceRows(ctx: CustomerContext) {
  const rows = await db
    .select({ invoice: invoices, jobTitle: jobs.title, jobNumber: jobs.number })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(and(eq(invoices.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id), ne(invoices.status, "draft")))
    .orderBy(desc(invoices.createdAt));
  const paid = await paidByInvoice(ctx.org.id, rows.map((row) => row.invoice.id));
  return rows.map(({ invoice, jobTitle, jobNumber }) => {
    const paidCents = paid.get(invoice.id) ?? 0;
    return {
      id: invoice.id,
      number: invoice.number,
      jobId: invoice.jobId,
      jobTitle,
      jobNumber,
      status: invoice.status,
      total: invoice.total,
      paid: paidCents,
      remaining: Math.max(0, invoice.total - paidCents),
      dueAt: iso(invoice.dueAt),
      createdAt: isoRequired(invoice.createdAt),
      pdfAvailable: true,
    };
  });
}

async function loadInvoiceDetail(ctx: CustomerContext, invoiceId: string) {
  const rows = await loadInvoiceRows(ctx);
  const summary = rows.find((row) => row.id === invoiceId);
  if (!summary) return null;
  const [items, paymentRows] = await Promise.all([
    db
      .select()
      .from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.orgId, ctx.org.id), eq(invoiceLineItems.invoiceId, invoiceId)))
      .orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.createdAt)),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, ctx.org.id), eq(payments.invoiceId, invoiceId)))
      .orderBy(desc(payments.paidAt)),
  ]);
  return {
    ...summary,
    lineItems: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit,
    })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      paidAt: isoRequired(payment.paidAt),
    })),
  };
}

async function loadEstimateRows(ctx: CustomerContext) {
  const rows = await db
    .select({ estimate: estimates, jobTitle: jobs.title })
    .from(estimates)
    .innerJoin(jobs, eq(estimates.jobId, jobs.id))
    .where(and(eq(estimates.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id), ne(estimates.status, "draft")))
    .orderBy(desc(estimates.createdAt));
  const optionRows = rows.length
    ? await db
        .select()
        .from(estimateOptions)
        .where(and(eq(estimateOptions.orgId, ctx.org.id), inArray(estimateOptions.estimateId, rows.map((row) => row.estimate.id))))
    : [];
  const optionsByEstimate = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByEstimate.get(option.estimateId) ?? [];
    list.push(option);
    optionsByEstimate.set(option.estimateId, list);
  }
  return rows.map(({ estimate, jobTitle }) => {
    const options = optionsByEstimate.get(estimate.id) ?? [];
    const selected = options.find((option) => option.id === estimate.selectedOptionId);
    return {
      id: estimate.id,
      number: estimate.number,
      jobId: estimate.jobId,
      jobTitle,
      status: estimate.status,
      total: estimate.total,
      createdAt: isoRequired(estimate.createdAt),
      expiresAt: iso(estimate.expiresAt),
      acceptedAt: iso(estimate.acceptedAt),
      selectedOptionLabel: selected?.label ?? null,
      pdfAvailable: true,
    };
  });
}

async function loadEstimateDetail(ctx: CustomerContext, estimateId: string) {
  const summary = (await loadEstimateRows(ctx)).find((row) => row.id === estimateId);
  if (!summary) return null;
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.orgId, ctx.org.id), eq(estimates.id, estimateId)))
    .limit(1);
  if (!estimate) return null;
  const options = await db
    .select()
    .from(estimateOptions)
    .where(and(eq(estimateOptions.orgId, ctx.org.id), eq(estimateOptions.estimateId, estimateId)))
    .orderBy(asc(estimateOptions.position));
  const optionIds = options.map((option) => option.id);
  const lines = optionIds.length
    ? await db
        .select()
        .from(estimateOptionLineItems)
        .where(and(eq(estimateOptionLineItems.orgId, ctx.org.id), inArray(estimateOptionLineItems.optionId, optionIds)))
        .orderBy(asc(estimateOptionLineItems.position), asc(estimateOptionLineItems.createdAt))
    : [];
  const linesByOption = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = linesByOption.get(line.optionId) ?? [];
    list.push(line);
    linesByOption.set(line.optionId, list);
  }
  return {
    ...summary,
    scope: estimate.scope,
    recommendations: estimate.recommendations,
    exclusions: estimate.exclusions,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      total: option.total,
      recommended: option.recommended,
      position: option.position,
      lineItems: (linesByOption.get(option.id) ?? []).map((line) => ({
        id: line.id,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unit: line.unit,
      })),
    })),
  };
}

async function loadAppointmentRows(ctx: CustomerContext) {
  const rows = await db
    .select({ appointment: appointments, job: jobs, technicianName: users.name })
    .from(appointments)
    .innerJoin(jobs, eq(appointments.jobId, jobs.id))
    .leftJoin(users, eq(appointments.technicianId, users.id))
    .where(and(eq(appointments.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id)))
    .orderBy(desc(appointments.startsAt));
  const requests = rows.length
    ? await db
        .select()
        .from(customerAppointmentRequests)
        .where(
          and(
            eq(customerAppointmentRequests.orgId, ctx.org.id),
            eq(customerAppointmentRequests.accountId, ctx.account.id),
            inArray(customerAppointmentRequests.appointmentId, rows.map((row) => row.appointment.id)),
          ),
        )
        .orderBy(desc(customerAppointmentRequests.createdAt))
    : [];
  const latest = new Map<string, (typeof requests)[number]>();
  for (const request of requests) {
    if (request.status !== "pending") continue;
    if (!latest.has(`${request.appointmentId}:${request.type}`)) latest.set(`${request.appointmentId}:${request.type}`, request);
  }
  const now = Date.now();
  return rows.map(({ appointment, job, technicianName }) => ({
    id: appointment.id,
    jobId: job.id,
    jobNumber: job.number,
    jobTitle: job.title,
    jobStatus: job.status,
    serviceAddress: job.serviceAddress,
    startsAt: isoRequired(appointment.startsAt),
    endsAt: isoRequired(appointment.endsAt),
    technicianName,
    upcoming: appointment.startsAt.getTime() >= now && job.status !== "canceled" && job.status !== "completed",
    rescheduleRequestPending: latest.has(`${appointment.id}:reschedule`),
    cancelRequestPending: latest.has(`${appointment.id}:cancel`),
  }));
}

async function loadJobRows(ctx: CustomerContext) {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id)))
    .orderBy(desc(jobs.createdAt));
  return rows;
}

async function loadEquipmentRows(ctx: CustomerContext) {
  const rows = await db
    .select({ equipment, propertyAddress: properties.address })
    .from(equipment)
    .leftJoin(properties, eq(equipment.propertyId, properties.id))
    .where(and(eq(equipment.orgId, ctx.org.id), eq(equipment.customerId, ctx.customer.id)))
    .orderBy(desc(equipment.createdAt));
  return rows.map(({ equipment: item, propertyAddress }) => ({
    id: item.id,
    type: item.type,
    make: item.make,
    model: item.model,
    serialNumber: item.serialNumber,
    assetTag: item.assetTag,
    capacity: item.capacity,
    installDate: iso(item.installDate),
    warrantyExpiry: iso(item.warrantyExpiry),
    lastMaintenance: iso(item.lastMaintenance),
    nextMaintenance: iso(item.nextMaintenance),
    status: item.status,
    propertyId: item.propertyId,
    propertyAddress,
    notes: item.notes,
  }));
}

async function loadSupportRows(ctx: CustomerContext) {
  const rows = await db
    .select()
    .from(customerSupportRequests)
    .where(and(eq(customerSupportRequests.orgId, ctx.org.id), eq(customerSupportRequests.accountId, ctx.account.id)))
    .orderBy(desc(customerSupportRequests.createdAt));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    message: row.message,
    status: row.status,
    response: row.response,
    respondedAt: iso(row.respondedAt),
    createdAt: isoRequired(row.createdAt),
  }));
}

async function loadReviewRows(ctx: CustomerContext) {
  const rows = await db
    .select({ review: reviews, jobTitle: jobs.title })
    .from(reviews)
    .innerJoin(jobs, eq(reviews.jobId, jobs.id))
    .where(and(eq(reviews.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id)))
    .orderBy(desc(reviews.createdAt));
  return rows.map(({ review, jobTitle }) => ({
    id: review.id,
    jobId: review.jobId,
    jobTitle,
    rating: review.rating,
    comment: review.comment,
    reply: review.reply,
    createdAt: isoRequired(review.createdAt),
  }));
}

async function loadVisitRows(ctx: CustomerContext) {
  const rows = await db
    .select({ visit: serviceVisits, agreementId: serviceAgreements.id, technicianName: users.name })
    .from(serviceVisits)
    .innerJoin(serviceAgreements, eq(serviceVisits.agreementId, serviceAgreements.id))
    .leftJoin(users, eq(serviceVisits.technicianId, users.id))
    .where(and(eq(serviceVisits.orgId, ctx.org.id), eq(serviceAgreements.customerId, ctx.customer.id)))
    .orderBy(desc(serviceVisits.dueAt));
  return rows.map(({ visit, agreementId, technicianName }) => ({
    id: visit.id,
    agreementId,
    title: visit.title,
    status: visit.status,
    visitType: visit.visitType,
    scheduledAt: iso(visit.scheduledAt),
    dueAt: iso(visit.dueAt),
    completedAt: iso(visit.completedAt),
    technicianName,
    workPerformed: visit.workPerformed,
    problemsFound: visit.problemsFound ?? [],
    recommendations: visit.recommendations,
  }));
}

async function loadPlanRow(ctx: CustomerContext, agreementId: string) {
  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(
      and(
        eq(serviceAgreements.orgId, ctx.org.id),
        eq(serviceAgreements.customerId, ctx.customer.id),
        eq(serviceAgreements.id, agreementId),
      ),
    )
    .limit(1);
  if (!agreement) return null;
  const visits = (await loadVisitRows(ctx)).filter((visit) => visit.agreementId === agreementId);
  const pending = await db
    .select({ id: customerSupportRequests.id })
    .from(customerSupportRequests)
    .where(
      and(
        eq(customerSupportRequests.orgId, ctx.org.id),
        eq(customerSupportRequests.accountId, ctx.account.id),
        eq(customerSupportRequests.kind, "renewal"),
        eq(customerSupportRequests.status, "open"),
        eq(customerSupportRequests.subject, `Renew ${agreement.planName} (${agreement.agreementNumber})`),
      ),
    )
    .limit(1);
  const nextVisit =
    visits
      .filter((visit) => visit.status !== "completed")
      .sort((a, b) => new Date(a.dueAt ?? a.scheduledAt ?? 0).getTime() - new Date(b.dueAt ?? b.scheduledAt ?? 0).getTime())[0] ??
    null;
  return {
    id: agreement.id,
    agreementNumber: agreement.agreementNumber,
    planName: agreement.planName,
    status: agreement.status,
    paymentStatus: agreement.paymentStatus,
    startsAt: iso(agreement.startsAt),
    endsAt: iso(agreement.endsAt),
    autoRenew: agreement.autoRenew,
    renewalType: agreement.renewalType,
    visitsIncluded: agreement.visitsIncluded,
    visitsCompleted: agreement.visitsCompleted,
    priceCents: agreement.priceCents,
    billingFrequency: agreement.billingFrequency,
    nextVisit,
    visits,
    renewalRequestPending: pending.length > 0,
  };
}

async function loadPlanRows(ctx: CustomerContext) {
  const rows = await db
    .select({ id: serviceAgreements.id })
    .from(serviceAgreements)
    .where(and(eq(serviceAgreements.orgId, ctx.org.id), eq(serviceAgreements.customerId, ctx.customer.id)))
    .orderBy(desc(serviceAgreements.createdAt));
  const plans = await Promise.all(rows.map((row) => loadPlanRow(ctx, row.id)));
  return plans.filter((plan): plan is NonNullable<typeof plan> => plan !== null);
}

type PortalNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

async function buildNotifications(ctx: CustomerContext): Promise<PortalNotification[]> {
  const [invoiceRows, estimateRows, appointmentRows, visitRows, supportRows, reviewRows, reads] = await Promise.all([
    loadInvoiceRows(ctx),
    loadEstimateRows(ctx),
    loadAppointmentRows(ctx),
    loadVisitRows(ctx),
    loadSupportRows(ctx),
    loadReviewRows(ctx),
    db
      .select({ key: customerNotificationReads.notificationKey })
      .from(customerNotificationReads)
      .where(and(eq(customerNotificationReads.orgId, ctx.org.id), eq(customerNotificationReads.accountId, ctx.account.id))),
  ]);
  const readKeys = new Set(reads.map((row) => row.key));
  const items: Omit<PortalNotification, "read">[] = [];
  for (const estimate of estimateRows) {
    if (estimate.status !== "sent") continue;
    items.push({
      id: `estimate:${estimate.id}:sent`,
      kind: "estimate",
      title: `Estimate ${estimate.number} is ready`,
      body: `${estimate.jobTitle} · ${formatMoney(estimate.total, ctx.currency)}`,
      link: "/account?tab=estimates",
      createdAt: estimate.createdAt,
    });
  }
  for (const invoice of invoiceRows) {
    if (invoice.status !== "sent" || invoice.remaining <= 0) continue;
    items.push({
      id: `invoice:${invoice.id}:due`,
      kind: "invoice",
      title: `Invoice ${invoice.number} is due`,
      body: `${invoice.jobTitle} · ${formatMoney(invoice.remaining, ctx.currency)} outstanding`,
      link: "/account?tab=invoices",
      createdAt: invoice.createdAt,
    });
  }
  for (const appointment of appointmentRows) {
    if (!appointment.upcoming) continue;
    items.push({
      id: `appointment:${appointment.id}:upcoming`,
      kind: "appointment",
      title: "Upcoming service visit",
      body: `${appointment.jobTitle} · ${new Date(appointment.startsAt).toLocaleString()}`,
      link: "/account?tab=appointments",
      createdAt: appointment.startsAt,
    });
  }
  for (const visit of visitRows) {
    if (visit.status === "completed") continue;
    const at = visit.dueAt ?? visit.scheduledAt;
    if (!at) continue;
    items.push({
      id: `visit:${visit.id}:upcoming`,
      kind: "service_plan",
      title: "Service plan visit scheduled",
      body: `${visit.title} · ${new Date(at).toLocaleDateString()}`,
      link: "/account?tab=plans",
      createdAt: at,
    });
  }
  for (const request of supportRows) {
    if (!request.response) continue;
    items.push({
      id: `support:${request.id}:response`,
      kind: "support",
      title: `Reply to "${request.subject}"`,
      body: request.response,
      link: "/account?tab=support",
      createdAt: request.respondedAt ?? request.createdAt,
    });
  }
  for (const review of reviewRows) {
    if (!review.reply) continue;
    items.push({
      id: `review:${review.id}:reply`,
      kind: "review",
      title: "The team replied to your review",
      body: review.reply,
      link: "/account?tab=reviews",
      createdAt: review.createdAt,
    });
  }
  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)
    .map((item) => ({ ...item, read: readKeys.has(item.id) }));
}

async function loadDocumentRows(ctx: CustomerContext) {
  const [estimateRows, invoiceRows, photoRows] = await Promise.all([
    loadEstimateRows(ctx),
    loadInvoiceRows(ctx),
    db
      .select()
      .from(photos)
      .innerJoin(jobs, eq(photos.jobId, jobs.id))
      .where(and(eq(photos.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id)))
      .orderBy(desc(photos.uploadedAt)),
  ]);
  return [
    ...estimateRows.map((estimate) => ({
      id: `estimate:${estimate.id}`,
      kind: "estimate" as const,
      documentId: estimate.id,
      number: estimate.number,
      title: `Estimate ${estimate.number}`,
      filename: `${estimate.number}.pdf`,
      sizeBytes: null,
      createdAt: estimate.createdAt,
      downloadUrl: `/customer-auth/orgs/${ctx.org.id}/estimates/${estimate.id}/pdf`,
    })),
    ...invoiceRows.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      kind: "invoice" as const,
      documentId: invoice.id,
      number: invoice.number,
      title: `Invoice ${invoice.number}`,
      filename: `${invoice.number}.pdf`,
      sizeBytes: null,
      createdAt: invoice.createdAt,
      downloadUrl: `/customer-auth/orgs/${ctx.org.id}/invoices/${invoice.id}/pdf`,
    })),
    ...photoRows.map(({ photos: photo }) => ({
      id: `photo:${photo.id}`,
      kind: "photo" as const,
      documentId: photo.id,
      number: null,
      title: photo.fileName ?? "Job photo",
      filename: photo.fileName ?? `${photo.id}.jpg`,
      sizeBytes: photo.fileSize,
      createdAt: isoRequired(photo.uploadedAt),
      downloadUrl: `/customer-auth/orgs/${ctx.org.id}/photos/${photo.id}/file`,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function loadDashboard(ctx: CustomerContext) {
  const [invoiceRows, estimateRows, appointmentRows, planRows, equipmentRows, propertyRows, jobRows, notificationRows] =
    await Promise.all([
      loadInvoiceRows(ctx),
      loadEstimateRows(ctx),
      loadAppointmentRows(ctx),
      loadPlanRows(ctx),
      loadEquipmentRows(ctx),
      db
        .select()
        .from(properties)
        .where(and(eq(properties.orgId, ctx.org.id), eq(properties.customerId, ctx.customer.id)))
        .orderBy(desc(properties.createdAt)),
      loadJobRows(ctx),
      buildNotifications(ctx),
    ]);
  const unpaidInvoices = invoiceRows.filter((invoice) => invoice.status === "sent" && invoice.remaining > 0);
  const outstandingBalance = unpaidInvoices.reduce((sum, invoice) => sum + invoice.remaining, 0);
  const lifetimeSpend = invoiceRows.reduce((sum, invoice) => sum + invoice.paid, 0);
  const pendingEstimates = estimateRows.filter((estimate) => estimate.status === "sent");
  const activePlans = planRows.filter((plan) => plan.status === "active");
  const nextAppointment = appointmentRows.filter((row) => row.upcoming).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null;
  const recentJobs = jobRows.slice(0, 5).map((job) => ({
    id: job.id,
    number: job.number,
    title: job.title,
    status: job.status,
    serviceCategory: job.serviceCategory,
    serviceAddress: job.serviceAddress,
    scheduledAt: iso(job.scheduledAt),
    completedAt: null,
    total: job.total,
    createdAt: isoRequired(job.createdAt),
  }));
  return {
    org: orgDto(ctx),
    customer: customerDto(ctx),
    stats: {
      outstandingBalance,
      unpaidInvoices: unpaidInvoices.length,
      pendingEstimates: pendingEstimates.length,
      upcomingAppointments: appointmentRows.filter((row) => row.upcoming).length,
      activePlans: activePlans.length,
      equipmentCount: equipmentRows.length,
      propertyCount: propertyRows.length,
      unreadNotifications: notificationRows.filter((row) => !row.read).length,
      lifetimeSpend,
    },
    nextAppointment,
    pendingEstimates: pendingEstimates.slice(0, 5),
    openInvoices: unpaidInvoices.slice(0, 5),
    activePlans,
    recentNotifications: notificationRows.slice(0, 5),
    recentJobs,
  };
}

async function notifyStaff(ctx: CustomerContext, type: string, title: string, body: string, link?: string) {
  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, ctx.org.id), inArray(users.role, ["owner", "dispatcher", "secretary"] as const)));
  await Promise.all(staff.map((member) => safeNotifyUser(ctx.org.id, member.id, { type, title, body, link })));
}

async function loadJobDetail(ctx: CustomerContext, jobId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id), eq(jobs.id, jobId)))
    .limit(1);
  if (!job) return null;
  const [timelineRows, photoRows, itemRows, appointmentRows, equipmentRows, reviewRows] = await Promise.all([
    db
      .select()
      .from(jobStatusHistory)
      .where(and(eq(jobStatusHistory.orgId, ctx.org.id), eq(jobStatusHistory.jobId, jobId)))
      .orderBy(asc(jobStatusHistory.createdAt)),
    db
      .select()
      .from(photos)
      .where(and(eq(photos.orgId, ctx.org.id), eq(photos.jobId, jobId)))
      .orderBy(desc(photos.uploadedAt)),
    db
      .select()
      .from(lineItems)
      .where(and(eq(lineItems.orgId, ctx.org.id), eq(lineItems.jobId, jobId)))
      .orderBy(desc(lineItems.createdAt)),
    db
      .select({ appointment: appointments, technicianName: users.name })
      .from(appointments)
      .leftJoin(users, eq(appointments.technicianId, users.id))
      .where(and(eq(appointments.orgId, ctx.org.id), eq(appointments.jobId, jobId)))
      .orderBy(desc(appointments.startsAt)),
    loadEquipmentRows(ctx),
    loadReviewRows(ctx),
  ]);
  const appointment = appointmentRows[0];
  const now = Date.now();
  const appointmentDto = appointment
    ? {
        id: appointment.appointment.id,
        jobId,
        jobNumber: job.number,
        jobTitle: job.title,
        jobStatus: job.status,
        serviceAddress: job.serviceAddress,
        startsAt: isoRequired(appointment.appointment.startsAt),
        endsAt: isoRequired(appointment.appointment.endsAt),
        technicianName: appointment.technicianName,
        upcoming:
          appointment.appointment.startsAt.getTime() >= now && job.status !== "canceled" && job.status !== "completed",
        rescheduleRequestPending: false,
        cancelRequestPending: false,
      }
    : null;
  const pending = appointment
    ? await db
        .select()
        .from(customerAppointmentRequests)
        .where(
          and(
            eq(customerAppointmentRequests.orgId, ctx.org.id),
            eq(customerAppointmentRequests.accountId, ctx.account.id),
            eq(customerAppointmentRequests.appointmentId, appointment.appointment.id),
            eq(customerAppointmentRequests.status, "pending"),
          ),
        )
    : [];
  if (appointmentDto) {
    appointmentDto.rescheduleRequestPending = pending.some((request) => request.type === "reschedule");
    appointmentDto.cancelRequestPending = pending.some((request) => request.type === "cancel");
  }
  const review = reviewRows.find((row) => row.jobId === jobId) ?? null;
  return {
    id: job.id,
    number: job.number,
    title: job.title,
    status: job.status,
    serviceCategory: job.serviceCategory,
    serviceAddress: job.serviceAddress,
    scheduledAt: iso(job.scheduledAt),
    completedAt: null,
    total: job.total,
    createdAt: isoRequired(job.createdAt),
    description: job.description,
    preferredDate: job.preferredDate,
    preferredTime: job.preferredTime,
    technicianName: appointment?.technicianName ?? null,
    appointment: appointmentDto,
    timeline: timelineRows.map((entry) => ({
      status: entry.toStatus,
      changedAt: isoRequired(entry.createdAt),
      reason: entry.reason,
    })),
    photos: photoRows.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      contentType: photo.contentType,
      category: photo.category,
      uploadedAt: isoRequired(photo.uploadedAt),
      fileUrl: `/customer-auth/orgs/${ctx.org.id}/photos/${photo.id}/file`,
    })),
    lineItems: itemRows.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit,
    })),
    equipment: job.propertyId ? equipmentRows.filter((item) => item.propertyId === job.propertyId) : equipmentRows,
    canReview: job.status === "completed" && !review,
    review,
  };
}

export async function customerPortalRoutes(app: FastifyInstance) {
  app.get("/orgs/:orgId/dashboard", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadDashboard(ctx);
  });

  app.get("/orgs/:orgId/profile", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return profileDto(ctx);
  });

  app.patch("/orgs/:orgId/profile", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email?.toLowerCase();
    if (email && email !== ctx.account.email) {
      const [conflict] = await db
        .select({ id: customerAccounts.id })
        .from(customerAccounts)
        .where(and(eq(customerAccounts.email, email), ne(customerAccounts.id, ctx.account.id)))
        .limit(1);
      if (conflict) return reply.code(409).send({ error: "an account with this email already exists" });
    }
    await db.transaction(async (tx) => {
      await tx
        .update(customerAccounts)
        .set({
          name: parsed.data.name ?? ctx.account.name,
          email: email ?? ctx.account.email,
          phone: parsed.data.phone === undefined ? ctx.account.phone : parsed.data.phone,
          updatedAt: new Date(),
        })
        .where(eq(customerAccounts.id, ctx.account.id));
      await tx
        .update(customers)
        .set({
          name: parsed.data.name ?? ctx.customer.name,
          email: email === undefined ? ctx.customer.email : email,
          phone: parsed.data.phone === undefined ? ctx.customer.phone : parsed.data.phone,
          company: parsed.data.company === undefined ? ctx.customer.company : parsed.data.company,
          address: parsed.data.address === undefined ? ctx.customer.address : parsed.data.address,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, ctx.customer.id));
    });
    const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, ctx.account.id)).limit(1);
    const [customer] = await db.select().from(customers).where(eq(customers.id, ctx.customer.id)).limit(1);
    return profileDto({ ...ctx, account: account!, customer: customer! });
  });

  app.post("/orgs/:orgId/profile/password", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = passwordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!(await verifyPassword(parsed.data.currentPassword, ctx.account.passwordHash))) {
      return reply.code(400).send({ error: "current password is incorrect" });
    }
    const passwordError = validatePasswordStrength(parsed.data.newPassword);
    if (passwordError) return reply.code(400).send({ error: passwordError });
    await db
      .update(customerAccounts)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(customerAccounts.id, ctx.account.id));
    await revokeAllRefreshTokens("customer", ctx.account.id);
    return { ok: true };
  });

  app.get("/orgs/:orgId/appointments", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadAppointmentRows(ctx);
  });

  app.post("/orgs/:orgId/appointments/:appointmentId/request", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId, appointmentId } = req.params as { orgId: string; appointmentId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = appointmentRequestBody.extend({ type: z.enum(["reschedule", "cancel"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .select({ appointment: appointments, job: jobs })
      .from(appointments)
      .innerJoin(jobs, eq(appointments.jobId, jobs.id))
      .where(
        and(
          eq(appointments.orgId, ctx.org.id),
          eq(appointments.id, appointmentId),
          eq(jobs.customerId, ctx.customer.id),
        ),
      )
      .limit(1);
    if (!row) return reply.code(404).send({ error: "appointment not found" });
    if (parsed.data.type === "reschedule" && !parsed.data.requestedStartsAt) {
      return reply.code(400).send({ error: "requestedStartsAt is required to reschedule" });
    }
    const [existing] = await db
      .select()
      .from(customerAppointmentRequests)
      .where(
        and(
          eq(customerAppointmentRequests.orgId, ctx.org.id),
          eq(customerAppointmentRequests.appointmentId, appointmentId),
          eq(customerAppointmentRequests.type, parsed.data.type),
          eq(customerAppointmentRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (existing) return reply.code(409).send({ error: "a request is already pending" });
    const [request] = await db
      .insert(customerAppointmentRequests)
      .values({
        orgId: ctx.org.id,
        customerId: ctx.customer.id,
        accountId: ctx.account.id,
        appointmentId,
        jobId: row.job.id,
        type: parsed.data.type,
        requestedStartsAt: parsed.data.requestedStartsAt ? new Date(parsed.data.requestedStartsAt) : null,
        reason: parsed.data.reason ?? null,
      })
      .returning();
    await safeEmitActivity(ctx.org.id, `customer_appointment_${parsed.data.type}_request`, `Customer requested to ${parsed.data.type} ${row.job.title}`, {
      customerId: ctx.customer.id,
      jobId: row.job.id,
    });
    await notifyStaff(
      ctx,
      `customer_appointment_${parsed.data.type}_request`,
      `Appointment ${parsed.data.type} request`,
      `${ctx.customer.name} requested to ${parsed.data.type} "${row.job.title}".`,
      `/dispatch`,
    );
    return reply.code(201).send({
      id: request.id,
      appointmentId: request.appointmentId,
      jobId: request.jobId,
      type: request.type,
      status: request.status,
      requestedStartsAt: iso(request.requestedStartsAt),
      reason: request.reason,
      createdAt: isoRequired(request.createdAt),
    });
  });

  app.get("/orgs/:orgId/appointment-requests", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const rows = await db
      .select()
      .from(customerAppointmentRequests)
      .where(and(eq(customerAppointmentRequests.orgId, ctx.org.id), eq(customerAppointmentRequests.accountId, ctx.account.id)))
      .orderBy(desc(customerAppointmentRequests.createdAt));
    return rows.map((row) => ({
      id: row.id,
      appointmentId: row.appointmentId,
      jobId: row.jobId,
      type: row.type,
      status: row.status,
      requestedStartsAt: iso(row.requestedStartsAt),
      reason: row.reason,
      createdAt: isoRequired(row.createdAt),
    }));
  });

  app.get("/orgs/:orgId/estimates", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadEstimateRows(ctx);
  });

  app.get("/orgs/:orgId/estimates/:estimateId", async (req, reply) => {
    const { orgId, estimateId } = req.params as { orgId: string; estimateId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const estimate = await loadEstimateDetail(ctx, estimateId);
    if (!estimate) return reply.code(404).send({ error: "estimate not found" });
    return estimate;
  });

  app.get("/orgs/:orgId/estimates/:estimateId/pdf", async (req, reply) => {
    const { orgId, estimateId } = req.params as { orgId: string; estimateId: string };
    const ctx = await resolveContext(app, req, reply, orgId, true);
    if (!ctx) return;
    const estimate = await loadEstimateRows(ctx);
    if (!estimate.some((row) => row.id === estimateId)) return reply.code(404).send({ error: "estimate not found" });
    const document = await ensureEstimateDocument(ctx.org.id, estimateId);
    if ("error" in document) return reply.code(document.statusCode).send({ error: document.error });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${document.row.filename}"`)
      .send(document.buffer);
  });

  app.get("/orgs/:orgId/invoices", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadInvoiceRows(ctx);
  });

  app.get("/orgs/:orgId/invoices/:invoiceId", async (req, reply) => {
    const { orgId, invoiceId } = req.params as { orgId: string; invoiceId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const invoice = await loadInvoiceDetail(ctx, invoiceId);
    if (!invoice) return reply.code(404).send({ error: "invoice not found" });
    return invoice;
  });

  app.get("/orgs/:orgId/invoices/:invoiceId/pdf", async (req, reply) => {
    const { orgId, invoiceId } = req.params as { orgId: string; invoiceId: string };
    const ctx = await resolveContext(app, req, reply, orgId, true);
    if (!ctx) return;
    const invoice = await loadInvoiceRows(ctx);
    if (!invoice.some((row) => row.id === invoiceId)) return reply.code(404).send({ error: "invoice not found" });
    const document = await ensureInvoiceDocument(ctx.org.id, invoiceId);
    if ("error" in document) return reply.code(document.statusCode).send({ error: document.error });
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${document.row.filename}"`)
      .send(document.buffer);
  });

  app.get("/orgs/:orgId/documents", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadDocumentRows(ctx);
  });

  app.get("/orgs/:orgId/jobs", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    const rows = await loadJobRows(ctx);
    return rows.map((job) => ({
      id: job.id,
      number: job.number,
      title: job.title,
      status: job.status,
      serviceCategory: job.serviceCategory,
      serviceAddress: job.serviceAddress,
      scheduledAt: iso(job.scheduledAt),
      completedAt: null,
      total: job.total,
      createdAt: isoRequired(job.createdAt),
    }));
  });

  app.get("/orgs/:orgId/jobs/:jobId", async (req, reply) => {
    const { orgId, jobId } = req.params as { orgId: string; jobId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const job = await loadJobDetail(ctx, jobId);
    if (!job) return reply.code(404).send({ error: "job not found" });
    return job;
  });

  app.get("/orgs/:orgId/photos/:photoId/file", async (req, reply) => {
    const { orgId, photoId } = req.params as { orgId: string; photoId: string };
    const ctx = await resolveContext(app, req, reply, orgId, true);
    if (!ctx) return;
    const [row] = await db
      .select({ id: photos.id })
      .from(photos)
      .innerJoin(jobs, eq(photos.jobId, jobs.id))
      .where(and(eq(photos.orgId, ctx.org.id), eq(photos.id, photoId), eq(jobs.customerId, ctx.customer.id)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "photo not found" });
    const file = await getPhotoFile(photoId, ctx.org.id);
    if (!file) return reply.code(404).send({ error: "photo not found" });
    reply.header("Content-Type", file.record.contentType);
    reply.header("Cache-Control", "private, max-age=300");
    return reply.send(file.buffer);
  });

  app.get("/orgs/:orgId/equipment", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadEquipmentRows(ctx);
  });

  app.get("/orgs/:orgId/properties", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const rows = await db
      .select()
      .from(properties)
      .where(and(eq(properties.orgId, ctx.org.id), eq(properties.customerId, ctx.customer.id)))
      .orderBy(desc(properties.createdAt));
    const [equipmentRows, jobRows] = await Promise.all([
      db.select({ propertyId: equipment.propertyId }).from(equipment).where(and(eq(equipment.orgId, ctx.org.id), eq(equipment.customerId, ctx.customer.id))),
      db.select({ propertyId: jobs.propertyId }).from(jobs).where(and(eq(jobs.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id))),
    ]);
    return rows.map((property) => ({
      id: property.id,
      address: property.address,
      lat: property.lat,
      lng: property.lng,
      equipmentCount: equipmentRows.filter((row) => row.propertyId === property.id).length,
      jobCount: jobRows.filter((row) => row.propertyId === property.id).length,
      createdAt: isoRequired(property.createdAt),
    }));
  });

  app.post("/orgs/:orgId/properties", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = propertyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [property] = await db
      .insert(properties)
      .values({
        orgId: ctx.org.id,
        customerId: ctx.customer.id,
        address: parsed.data.address,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
      })
      .returning();
    return reply.code(201).send({
      id: property.id,
      address: property.address,
      lat: property.lat,
      lng: property.lng,
      equipmentCount: 0,
      jobCount: 0,
      createdAt: isoRequired(property.createdAt),
    });
  });

  app.delete("/orgs/:orgId/properties/:propertyId", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId, propertyId } = req.params as { orgId: string; propertyId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const [property] = await db
      .select()
      .from(properties)
      .where(
        and(eq(properties.orgId, ctx.org.id), eq(properties.id, propertyId), eq(properties.customerId, ctx.customer.id)),
      )
      .limit(1);
    if (!property) return reply.code(404).send({ error: "property not found" });
    await db.delete(properties).where(eq(properties.id, propertyId));
    return { ok: true };
  });

  app.get("/orgs/:orgId/notifications", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return buildNotifications(ctx);
  });

  app.post("/orgs/:orgId/notifications/read", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = notificationReadBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const notifications = await buildNotifications(ctx);
    const keys = parsed.data.keys ?? notifications.filter((item) => !item.read).map((item) => item.id);
    if (keys.length > 0) {
      await db
        .insert(customerNotificationReads)
        .values(
          keys.map((key) => ({
            orgId: ctx.org.id,
            customerId: ctx.customer.id,
            accountId: ctx.account.id,
            notificationKey: key,
          })),
        )
        .onConflictDoNothing();
    }
    return { ok: true, read: keys.length };
  });

  app.get("/orgs/:orgId/reviews", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    return loadReviewRows(ctx);
  });

  app.post("/orgs/:orgId/reviews", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = reviewBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, ctx.org.id), eq(jobs.id, parsed.data.jobId), eq(jobs.customerId, ctx.customer.id)))
      .limit(1);
    if (!job) return reply.code(404).send({ error: "job not found" });
    if (job.status !== "completed") return reply.code(409).send({ error: "only completed jobs can be reviewed" });
    const [existing] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.orgId, ctx.org.id), eq(reviews.jobId, job.id)))
      .limit(1);
    if (existing) return reply.code(409).send({ error: "a review already exists for this job" });
    const [review] = await db
      .insert(reviews)
      .values({ orgId: ctx.org.id, jobId: job.id, rating: parsed.data.rating, comment: parsed.data.comment ?? null })
      .returning();
    await safeEmitActivity(ctx.org.id, "customer_review", `Customer reviewed ${job.title} (${parsed.data.rating}/5)`, {
      customerId: ctx.customer.id,
      jobId: job.id,
    });
    await notifyStaff(ctx, "customer_review", "New customer review", `${ctx.customer.name} left ${parsed.data.rating}/5 for "${job.title}".`, "/reviews");
    return reply.code(201).send({
      id: review.id,
      jobId: review.jobId,
      jobTitle: job.title,
      rating: review.rating,
      comment: review.comment,
      reply: review.reply,
      createdAt: isoRequired(review.createdAt),
    });
  });

  app.get("/orgs/:orgId/support", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadSupportRows(ctx);
  });

  app.post("/orgs/:orgId/support", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = supportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let jobId: string | null = null;
    if (parsed.data.jobId) {
      const [job] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.orgId, ctx.org.id), eq(jobs.id, parsed.data.jobId), eq(jobs.customerId, ctx.customer.id)))
        .limit(1);
      if (!job) return reply.code(404).send({ error: "job not found" });
      jobId = job.id;
    }
    const [request] = await db
      .insert(customerSupportRequests)
      .values({
        orgId: ctx.org.id,
        customerId: ctx.customer.id,
        accountId: ctx.account.id,
        jobId,
        kind: parsed.data.kind ?? "general",
        subject: parsed.data.subject,
        message: parsed.data.message,
      })
      .returning();
    await safeEmitActivity(ctx.org.id, "customer_support_request", `Customer request: ${request.subject}`, {
      customerId: ctx.customer.id,
      jobId: jobId ?? undefined,
    });
    await notifyStaff(ctx, "customer_support_request", "New customer request", `${ctx.customer.name}: ${request.subject}`, "/messages");
    return reply.code(201).send({
      id: request.id,
      kind: request.kind,
      subject: request.subject,
      message: request.message,
      status: request.status,
      response: request.response,
      respondedAt: iso(request.respondedAt),
      createdAt: isoRequired(request.createdAt),
    });
  });

  app.get("/orgs/:orgId/preferences", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const [row] = await db
      .select()
      .from(customerPortalPreferences)
      .where(and(eq(customerPortalPreferences.orgId, ctx.org.id), eq(customerPortalPreferences.accountId, ctx.account.id)))
      .limit(1);
    return {
      emailUpdates: row?.emailUpdates ?? true,
      smsUpdates: row?.smsUpdates ?? true,
      marketingOptIn: row?.marketingOptIn ?? false,
      language: row?.language ?? "en",
      updatedAt: iso(row?.updatedAt),
    };
  });

  app.patch("/orgs/:orgId/preferences", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const parsed = preferencesBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [existing] = await db
      .select()
      .from(customerPortalPreferences)
      .where(and(eq(customerPortalPreferences.orgId, ctx.org.id), eq(customerPortalPreferences.accountId, ctx.account.id)))
      .limit(1);
    const values = {
      emailUpdates: parsed.data.emailUpdates ?? existing?.emailUpdates ?? true,
      smsUpdates: parsed.data.smsUpdates ?? existing?.smsUpdates ?? true,
      marketingOptIn: parsed.data.marketingOptIn ?? existing?.marketingOptIn ?? false,
      language: parsed.data.language ?? existing?.language ?? "en",
    };
    const [row] = await db
      .insert(customerPortalPreferences)
      .values({
        orgId: ctx.org.id,
        accountId: ctx.account.id,
        customerId: ctx.customer.id,
        ...values,
      })
      .onConflictDoUpdate({
        target: [customerPortalPreferences.orgId, customerPortalPreferences.accountId],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return {
      emailUpdates: row!.emailUpdates,
      smsUpdates: row!.smsUpdates,
      marketingOptIn: row!.marketingOptIn,
      language: row!.language,
      updatedAt: iso(row!.updatedAt),
    };
  });

  app.get("/orgs/:orgId/communications", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const rows = await db
      .select()
      .from(messageLogs)
      .where(and(eq(messageLogs.orgId, ctx.org.id), eq(messageLogs.customerId, ctx.customer.id)))
      .orderBy(desc(messageLogs.createdAt));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      status: row.status,
      recipient: row.recipient,
      sentAt: iso(row.sentAt),
      createdAt: isoRequired(row.createdAt),
    }));
  });

  app.get("/orgs/:orgId/service-plans", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    reply.header("Cache-Control", "no-store");
    return loadPlanRows(ctx);
  });

  app.get("/orgs/:orgId/service-plans/:agreementId", async (req, reply) => {
    const { orgId, agreementId } = req.params as { orgId: string; agreementId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const plan = await loadPlanRow(ctx, agreementId);
    if (!plan) return reply.code(404).send({ error: "service plan not found" });
    return plan;
  });

  app.post("/orgs/:orgId/service-plans/:agreementId/renewal", { preHandler: writeRateLimit }, async (req, reply) => {
    const { orgId, agreementId } = req.params as { orgId: string; agreementId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const plan = await loadPlanRow(ctx, agreementId);
    if (!plan) return reply.code(404).send({ error: "service plan not found" });
    if (plan.renewalRequestPending) return reply.code(409).send({ error: "a renewal request is already pending" });
    const [request] = await db
      .insert(customerSupportRequests)
      .values({
        orgId: ctx.org.id,
        customerId: ctx.customer.id,
        accountId: ctx.account.id,
        kind: "renewal",
        subject: `Renew ${plan.planName} (${plan.agreementNumber})`,
        message: `Customer requested renewal of service plan ${plan.agreementNumber}.`,
        status: "open",
      })
      .returning();
    await safeEmitActivity(ctx.org.id, "customer_plan_renewal_request", `Customer requested renewal of ${plan.planName}`, {
      customerId: ctx.customer.id,
    });
    await notifyStaff(ctx, "customer_plan_renewal_request", "Service plan renewal requested", `${ctx.customer.name} requested renewal of ${plan.planName}.`, "/service-plans");
    return reply.code(201).send({
      id: request.id,
      kind: request.kind,
      subject: request.subject,
      message: request.message,
      status: request.status,
      response: request.response,
      respondedAt: iso(request.respondedAt),
      createdAt: isoRequired(request.createdAt),
    });
  });

  app.get("/orgs/:orgId/statement", async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const ctx = await resolveContext(app, req, reply, orgId);
    if (!ctx) return;
    const [invoiceRows, paymentRows] = await Promise.all([
      loadInvoiceRows(ctx),
      db
        .select({ payment: payments, invoiceNumber: invoices.number })
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .innerJoin(jobs, eq(invoices.jobId, jobs.id))
        .where(and(eq(payments.orgId, ctx.org.id), eq(jobs.customerId, ctx.customer.id)))
        .orderBy(desc(payments.paidAt)),
    ]);
    return {
      currency: ctx.currency,
      outstanding: invoiceRows.reduce((sum, invoice) => sum + invoice.remaining, 0),
      lifetimeSpend: invoiceRows.reduce((sum, invoice) => sum + invoice.paid, 0),
      invoices: invoiceRows,
      payments: paymentRows.map(({ payment, invoiceNumber }) => ({
        id: payment.id,
        invoiceId: payment.invoiceId,
        invoiceNumber,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        paidAt: isoRequired(payment.paidAt),
      })),
    };
  });

}

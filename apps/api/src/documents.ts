// Durable PDF documents. HTML is assembled in @nnact/shared (same as web preview),
// rendered to PDF with Puppeteer, then stored immutably in the documents table.
import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  documents,
  invoices,
  invoiceLineItems,
  payments,
  estimates,
  estimateOptions,
  estimateOptionLineItems,
  jobs,
  customers,
  orgs,
  messageLogs,
} from "@nnact/db";
import { formatDocumentCents, invoiceDocumentData, estimateDocumentData, fieldDocumentTitle, type FieldDocumentData } from "@nnact/shared";
import { mergeBusinessSettings } from "@nnact/shared";
import { getOrgLogo } from "./uploads.js";
import { renderFieldDocumentPdf } from "./render-document-pdf.js";

export { renderFieldDocumentPdf } from "./render-document-pdf.js";

export function documentSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function documentFilename(kind: string, number: string): string {
  const safe = number.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${kind} ${safe}.pdf`;
}

async function documentDataWithInlineLogo(data: FieldDocumentData, orgId: string): Promise<FieldDocumentData> {
  if (!data.branding.logoUrl) return data;
  try {
    const logo = await getOrgLogo(orgId);
    if (!logo) return data;
    return {
      ...data,
      branding: {
        ...data.branding,
        logoUrl: `data:${logo.contentType};base64,${logo.buffer.toString("base64")}`,
      },
    };
  } catch {
    return data;
  }
}

async function renderStoredDocumentPdf(data: FieldDocumentData, orgId: string): Promise<Buffer> {
  const branded = await documentDataWithInlineLogo(data, orgId);
  return renderFieldDocumentPdf(branded);
}

// ── DB-backed store ──

export type DocumentKind = "invoice" | "estimate";

export interface StoredDocument {
  id: string;
  kind: DocumentKind;
  documentId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface DocumentHubEntry {
  kind: DocumentKind;
  documentId: string;
  number: string;
  status: string;
  total: number;
  customerName: string | null;
  customerId: string | null;
  jobId: string;
  jobTitle: string | null;
  createdAt: string;
  stored: StoredDocument | null;
  emailsSent: number;
  lastEmailAt: string | null;
  lastEmailStatus: "pending" | "sent" | "failed" | null;
}

export function documentView(row: typeof documents.$inferSelect): StoredDocument {
  return {
    id: row.id,
    kind: row.kind as DocumentKind,
    documentId: row.documentId,
    filename: row.filename,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  };
}

async function customerForJob(orgId: string, jobId: string) {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) return null;
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, job.customerId)));
  return customer ?? null;
}

async function orgContext(orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) return null;
  return {
    name: org.name,
    logoUrl: org.logoUrl,
    brandColor: org.brandColor,
    documentFooter: org.documentFooter,
    publicEmail: org.publicEmail,
    publicPhone: org.publicPhone,
    publicAddress: org.publicAddress,
    removeOpenFieldProAttribution: org.removeOpenFieldProAttribution ?? false,
    businessSettings: mergeBusinessSettings(org.businessSettings),
  };
}

async function storePdf(orgId: string, kind: DocumentKind, documentId: string, filename: string, buffer: Buffer) {
  const sha256 = documentSha256(buffer);
  const [row] = await db
    .insert(documents)
    .values({
      orgId,
      kind,
      documentId,
      filename,
      mime: "application/pdf",
      sizeBytes: buffer.length,
      sha256,
      data: buffer,
    })
    .onConflictDoNothing({ target: [documents.orgId, documents.kind, documents.documentId] })
    .returning();
  if (row) return { row, created: true };
  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.kind, kind), eq(documents.documentId, documentId)));
  return { row: existing, created: false };
}

async function loadStored(orgId: string, kind: DocumentKind, documentId: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.kind, kind), eq(documents.documentId, documentId)));
  return row ?? null;
}

/**
 * Returns the stored PDF for an invoice, generating and storing it on first
 * request. Once stored, the artifact is immutable until regenerate.
 */
export async function ensureInvoiceDocument(orgId: string, invoiceId: string): Promise<{ row: typeof documents.$inferSelect; buffer: Buffer; created: boolean } | { error: string; statusCode: number }> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  if (!invoice) return { error: "invoice not found", statusCode: 404 };

  const existing = await loadStored(orgId, "invoice", invoiceId);
  if (existing) return { row: existing, buffer: existing.data, created: false };

  const [customer, job, org] = await Promise.all([
    customerForJob(orgId, invoice.jobId),
    db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, invoice.jobId))).then((rows) => rows[0] ?? null),
    orgContext(orgId),
  ]);
  const items = await db
    .select()
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.orgId, orgId), eq(invoiceLineItems.invoiceId, invoiceId)))
    .orderBy(asc(invoiceLineItems.position), asc(invoiceLineItems.createdAt));
  const paidRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoiceId)));

  const data = invoiceDocumentData({
    invoice: { ...invoice, payments: paidRows },
    customer,
    job,
    lineItems: items,
    org,
  });
  const buffer = await renderStoredDocumentPdf(data, orgId);
  const filename = documentFilename("Invoice", invoice.number);
  const { row } = await storePdf(orgId, "invoice", invoiceId, filename, buffer);
  return { row, buffer, created: true };
}

/** Returns the stored PDF for an estimate, generating and storing on first request. */
export async function ensureEstimateDocument(orgId: string, estimateId: string): Promise<{ row: typeof documents.$inferSelect; buffer: Buffer; created: boolean } | { error: string; statusCode: number }> {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.orgId, orgId), eq(estimates.id, estimateId)));
  if (!estimate) return { error: "estimate not found", statusCode: 404 };

  const existing = await loadStored(orgId, "estimate", estimateId);
  if (existing) return { row: existing, buffer: existing.data, created: false };

  const [customer, job, org] = await Promise.all([
    customerForJob(orgId, estimate.jobId),
    db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, estimate.jobId))).then((rows) => rows[0] ?? null),
    orgContext(orgId),
  ]);
  const options = await db
    .select()
    .from(estimateOptions)
    .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, estimateId)))
    .orderBy(asc(estimateOptions.position));
  const optionIds = options.map((option) => option.id);
  const optionLines = optionIds.length
    ? await db
        .select()
        .from(estimateOptionLineItems)
        .where(and(eq(estimateOptionLineItems.orgId, orgId), inArray(estimateOptionLineItems.optionId, optionIds)))
        .orderBy(asc(estimateOptionLineItems.createdAt))
    : [];
  const estimateOptionsForDoc = options.map((option) => ({
    id: option.id,
    label: option.label,
    lineItems: optionLines
      .filter((line) => line.optionId === option.id)
      .map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    pricing: option.pricing,
  }));
  const primaryLineItems = estimateOptionsForDoc[0]?.lineItems ?? [];

  const data = estimateDocumentData({
    estimate: {
      ...estimate,
      options: estimateOptionsForDoc,
      selectedOptionId: estimate.selectedOptionId,
    },
    customer,
    job,
    lineItems: primaryLineItems,
    org,
  });
  const buffer = await renderStoredDocumentPdf(data, orgId);
  const filename = documentFilename("Estimate", data.number);
  const { row } = await storePdf(orgId, "estimate", estimateId, filename, buffer);
  return { row, buffer, created: true };
}

/** Explicitly regenerates and replaces the stored PDF for a document. */
export async function regenerateDocument(orgId: string, kind: DocumentKind, documentId: string): Promise<{ row: typeof documents.$inferSelect; buffer: Buffer } | { error: string; statusCode: number }> {
  const result =
    kind === "invoice"
      ? await ensureInvoiceDocument(orgId, documentId)
      : await ensureEstimateDocument(orgId, documentId);
  if ("error" in result) return result;

  await db
    .delete(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.kind, kind), eq(documents.documentId, documentId)));
  const regenerated =
    kind === "invoice"
      ? await ensureInvoiceDocument(orgId, documentId)
      : await ensureEstimateDocument(orgId, documentId);
  if ("error" in regenerated) return regenerated;
  return { row: regenerated.row, buffer: regenerated.buffer };
}

/** Lists invoices and estimates with stored PDF metadata and email delivery stats. */
export async function listDocumentHub(orgId: string): Promise<DocumentHubEntry[]> {
  const [invoiceRows, estimateRows, storedRows, messageRows, jobRows, customerRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.orgId, orgId)),
    db.select().from(estimates).where(eq(estimates.orgId, orgId)),
    db.select().from(documents).where(eq(documents.orgId, orgId)),
    db.select().from(messageLogs).where(and(eq(messageLogs.orgId, orgId), inArray(messageLogs.kind, ["invoice", "estimate"]))),
    db.select({ id: jobs.id, title: jobs.title, customerId: jobs.customerId }).from(jobs).where(eq(jobs.orgId, orgId)),
    db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.orgId, orgId)),
  ]);

  const jobMap = new Map(jobRows.map((row) => [row.id, row]));
  const customerMap = new Map(customerRows.map((row) => [row.id, row.name]));
  const storedMap = new Map(storedRows.map((row) => [`${row.kind}:${row.documentId}`, documentView(row)]));

  const messageStats = new Map<
    string,
    { emailsSent: number; lastEmailAt: string | null; lastEmailStatus: "pending" | "sent" | "failed" | null }
  >();

  for (const log of messageRows) {
    const key = `${log.kind}:${log.documentId}`;
    const current = messageStats.get(key) ?? { emailsSent: 0, lastEmailAt: null, lastEmailStatus: null };
    if (log.status === "sent") current.emailsSent += 1;
    const attemptAt = log.sentAt ?? log.lastAttemptAt ?? log.createdAt;
    const attemptIso = attemptAt.toISOString();
    if (!current.lastEmailAt || new Date(attemptIso) > new Date(current.lastEmailAt)) {
      current.lastEmailAt = attemptIso;
      current.lastEmailStatus = log.status as DocumentHubEntry["lastEmailStatus"];
    }
    messageStats.set(key, current);
  }

  const entries: DocumentHubEntry[] = [];

  for (const invoice of invoiceRows) {
    const job = jobMap.get(invoice.jobId);
    const key = `invoice:${invoice.id}`;
    const stats = messageStats.get(key);
    entries.push({
      kind: "invoice",
      documentId: invoice.id,
      number: invoice.number,
      status: invoice.status,
      total: invoice.total,
      customerName: job ? customerMap.get(job.customerId) ?? null : null,
      customerId: job?.customerId ?? null,
      jobId: invoice.jobId,
      jobTitle: job?.title ?? null,
      createdAt: invoice.createdAt.toISOString(),
      stored: storedMap.get(key) ?? null,
      emailsSent: stats?.emailsSent ?? 0,
      lastEmailAt: stats?.lastEmailAt ?? null,
      lastEmailStatus: stats?.lastEmailStatus ?? null,
    });
  }

  for (const estimate of estimateRows) {
    const job = jobMap.get(estimate.jobId);
    const key = `estimate:${estimate.id}`;
    const stats = messageStats.get(key);
    entries.push({
      kind: "estimate",
      documentId: estimate.id,
      number: estimate.number,
      status: estimate.status,
      total: estimate.total,
      customerName: job ? customerMap.get(job.customerId) ?? null : null,
      customerId: job?.customerId ?? null,
      jobId: estimate.jobId,
      jobTitle: job?.title ?? null,
      createdAt: estimate.createdAt.toISOString(),
      stored: storedMap.get(key) ?? null,
      emailsSent: stats?.emailsSent ?? 0,
      lastEmailAt: stats?.lastEmailAt ?? null,
      lastEmailStatus: stats?.lastEmailStatus ?? null,
    });
  }

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return entries;
}

// Re-export for callers that format cents in legacy PDF helpers.
export { formatDocumentCents, fieldDocumentTitle };

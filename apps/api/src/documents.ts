// Durable PDF documents. Documents are rendered server-side from the same
// shared FieldDocumentData that powers the web preview, then stored immutably
// in the documents table (bytea) so emailed and downloaded artifacts never
// drift with later edits or rebranding. Regeneration is an explicit action.
import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
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
import { formatDocumentCents, invoiceDocumentData, estimateDocumentData, fieldDocumentTitle } from "@nnact/shared";
import { mergeBusinessSettings } from "@nnact/shared";

export function documentSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function documentFilename(kind: string, number: string): string {
  const safe = number.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${kind} ${safe}.pdf`;
}

const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = 612 - MARGIN * 2;

interface PdfContext {
  doc: PDFKit.PDFDocument;
  y: number;
  brandColor: string;
}

function ensureSpace(ctx: PdfContext, height: number) {
  if (ctx.y + height > PAGE_HEIGHT - MARGIN) {
    ctx.doc.addPage();
    ctx.y = MARGIN;
  }
}

function drawHeader(ctx: PdfContext, data: import("@nnact/shared").FieldDocumentData) {
  const { doc, brandColor } = ctx;
  doc.rect(0, 0, 612, 6).fill(brandColor);
  ctx.y = MARGIN;

  const title = fieldDocumentTitle(data.kind);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(brandColor).text(data.branding.companyName, MARGIN, ctx.y, { width: 300 });
  const contact = [data.branding.publicPhone, data.branding.publicEmail, data.branding.publicAddress]
    .filter((value): value is string => Boolean(value))
    .join("  ·  ");
  if (contact) {
    doc.font("Helvetica").fontSize(8).fillColor("#647168").text(contact, MARGIN, ctx.y + 20, { width: 300 });
  }

  // Right-aligned kind block.
  doc.font("Helvetica-Bold").fontSize(7).fillColor(brandColor).text((data.status ?? "draft").toUpperCase(), 440, MARGIN + 2, { width: 124, align: "right" });
  doc.font("Helvetica-Bold").fontSize(26).fillColor("#17201b").text(title, 440, MARGIN + 12, { width: 124, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#364139").text(`#${data.number}`, 440, MARGIN + 46, { width: 124, align: "right" });
  ctx.y = MARGIN + 70;

  doc.moveTo(MARGIN, ctx.y).lineTo(612 - MARGIN, ctx.y).strokeColor("#ccd5ce").lineWidth(1).stroke();
  ctx.y += 18;
}

function drawInfoBoxes(ctx: PdfContext, data: import("@nnact/shared").FieldDocumentData) {
  const { doc } = ctx;
  const boxWidth = (CONTENT_WIDTH - 14) / 2;
  ensureSpace(ctx, 74);

  const customer = [
    data.customerName,
    [data.customerEmail, data.customerPhone].filter((value): value is string => Boolean(value)).join(" · ") || null,
  ].filter((value): value is string => Boolean(value));
  const jobLines = [
    data.jobTitle ?? fieldDocumentTitle(data.kind),
    `Issued ${data.issuedAt ?? new Date().toLocaleDateString()}${data.dueAt ? `  ·  Due ${data.dueAt}` : ""}`,
  ];

  drawBox(ctx, MARGIN, "CUSTOMER", customer);
  drawBox(ctx, MARGIN + boxWidth + 14, "JOB", jobLines);
  ctx.y += 18;
}

function drawBox(ctx: PdfContext, x: number, label: string, lines: string[]) {
  const { doc } = ctx;
  const boxWidth = (CONTENT_WIDTH - 14) / 2;
  doc.roundedRect(x, ctx.y, boxWidth, 62, 6).lineWidth(1).strokeColor("#dfe5e0").stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b776f").text(label, x + 12, ctx.y + 10, { width: boxWidth - 24 });
  doc.font("Helvetica").fontSize(10).fillColor("#17201b").text(lines[0] ?? "", x + 12, ctx.y + 22, { width: boxWidth - 24 });
  if (lines[1]) {
    doc.font("Helvetica").fontSize(8).fillColor("#647168").text(lines[1], x + 12, ctx.y + 40, { width: boxWidth - 24 });
  }
}

function drawLineItemsTable(ctx: PdfContext, items: { description: string; quantity: number; unitPriceCents: number }[], showPrices: boolean) {
  const { doc } = ctx;
  const columns = [
    { x: MARGIN, width: 300, align: "left" as const },
    { x: 420, width: 60, align: "right" as const },
    { x: 470, width: 60, align: "right" as const },
    { x: 520, width: 44, align: "right" as const },
  ];

  doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b776f");
  doc.text("DESCRIPTION", columns[0].x, ctx.y + 4, { width: columns[0].width });
  doc.text("QTY", columns[1].x, ctx.y + 4, { width: columns[1].width, align: columns[1].align });
  doc.text("UNIT", columns[2].x, ctx.y + 4, { width: columns[2].width, align: columns[2].align });
  doc.text("TOTAL", columns[3].x, ctx.y + 4, { width: columns[3].width, align: columns[3].align });
  ctx.y += 22;
  doc.moveTo(MARGIN, ctx.y).lineTo(612 - MARGIN, ctx.y).strokeColor("#ccd5ce").lineWidth(1).stroke();

  doc.font("Helvetica").fontSize(9.5).fillColor("#17201b");
  for (const item of items) {
    const descHeight = doc.heightOfString(item.description, { width: columns[0].width });
    const rowHeight = Math.max(descHeight + 14, 22);
    ensureSpace(ctx, rowHeight);
    doc.text(item.description, columns[0].x, ctx.y + 6, { width: columns[0].width });
    doc.text(String(item.quantity), columns[1].x, ctx.y + 6, { width: columns[1].width, align: columns[1].align });
    if (showPrices) {
      doc.text(formatDocumentCents(item.unitPriceCents), columns[2].x, ctx.y + 6, { width: columns[2].width, align: columns[2].align });
      doc.text(formatDocumentCents(item.quantity * item.unitPriceCents), columns[3].x, ctx.y + 6, { width: columns[3].width, align: columns[3].align });
    }
    ctx.y += rowHeight;
  }
  ctx.y += 8;
}

function drawTotals(ctx: PdfContext, totals: { subtotalCents: number; paidCents: number; balanceCents: number }, show: { payments: boolean; balance: boolean }, pricing?: import("@nnact/shared").DocumentPricing) {
  const { doc } = ctx;
  const x = 400;
  const width = 164;
  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", formatDocumentCents(totals.subtotalCents), false],
  ];
  if (pricing) {
    if (pricing.discountCents > 0) rows.push([pricing.discountLabel || "Discount", `-${formatDocumentCents(pricing.discountCents)}`, false]);
    if (pricing.taxCents > 0 || pricing.taxLabel) rows.push([pricing.taxLabel || "Tax", formatDocumentCents(pricing.taxCents), false]);
    rows.push(["Total", formatDocumentCents(pricing.totalCents), true]);
  }
  if (show.payments && !pricing) rows.push(["Paid", formatDocumentCents(totals.paidCents), false]);
  if (show.balance) rows.push(["Balance", formatDocumentCents(totals.balanceCents), true]);
  ensureSpace(ctx, rows.length * 22 + 8);

  for (const [label, value, strong] of rows) {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 13 : 9.5).fillColor("#17201b");
    doc.text(label, x, ctx.y, { width, align: "right" });
    doc.font("Helvetica-Bold").fontSize(strong ? 13 : 9.5).fillColor("#17201b");
    doc.text(value, x, ctx.y, { width, align: "right" });
    ctx.y += 22;
  }
  ctx.y += 6;
}

function drawNotes(ctx: PdfContext, notes: string) {
  const { doc, brandColor } = ctx;
  ensureSpace(ctx, 40);
  const height = doc.heightOfString(notes, { width: CONTENT_WIDTH - 12 });
  doc.rect(MARGIN, ctx.y, 3, height).fill(brandColor);
  doc.font("Helvetica").fontSize(9).fillColor("#4f5d54").text(notes, MARGIN + 12, ctx.y, { width: CONTENT_WIDTH - 12 });
  ctx.y += height + 14;
}

function drawFooter(ctx: PdfContext, data: import("@nnact/shared").FieldDocumentData) {
  const { doc } = ctx;
  ensureSpace(ctx, 40);
  doc.moveTo(MARGIN, PAGE_HEIGHT - MARGIN - 24).lineTo(612 - MARGIN, PAGE_HEIGHT - MARGIN - 24).strokeColor("#dfe5e0").lineWidth(1).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#6b776f");
  doc.text(data.branding.footerText ?? "Field service document", MARGIN, PAGE_HEIGHT - MARGIN - 18, { width: 400 });
  const attribution = data.branding.removeOpenFieldProAttribution ? "" : "Powered by NNACT Pro";
  if (attribution) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#364139").text(attribution, 400, PAGE_HEIGHT - MARGIN - 18, { width: 164, align: "right" });
  }
}

export function renderFieldDocumentPdf(data: import("@nnact/shared").FieldDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: MARGIN,
      info: {
        Title: `${fieldDocumentTitle(data.kind)} ${data.number}`,
        Author: data.branding.companyName,
        Producer: "NNACT Pro",
        // Fixed timestamps keep generated bytes reproducible across runs.
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ctx: PdfContext = { doc, y: 0, brandColor: data.branding.brandColor ?? "#22C55E" };
    const presentation = data.presentation ?? {};
    const showPrices = presentation.showLineItemPrices ?? true;

    drawHeader(ctx, data);
    drawInfoBoxes(ctx, data);

    if (data.options?.length) {
      for (const option of data.options) {
        const optionTotal = option.pricing?.totalCents ?? option.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
        ensureSpace(ctx, 40);
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#17201b").text(option.label, MARGIN, ctx.y, { width: 300 });
        if (option.selected) {
          doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
          doc.roundedRect(430, ctx.y - 1, 80, 14, 7).fill(ctx.brandColor);
          doc.text(data.status === "approved" ? "APPROVED" : "SELECTED", 440, ctx.y + 1, { width: 60, align: "center" });
        }
        ctx.y += 22;
        drawLineItemsTable(ctx, option.lineItems, showPrices);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#17201b");
        doc.text(`Option total  ${formatDocumentCents(optionTotal)}`, 380, ctx.y, { width: 184, align: "right" });
        ctx.y += 22;
      }
    } else {
      drawLineItemsTable(ctx, data.lineItems, showPrices);
      const totals = data.lineItems.reduce(
        (acc, item) => ({ ...acc, subtotalCents: acc.subtotalCents + item.quantity * item.unitPriceCents }),
        { subtotalCents: 0, paidCents: data.paymentsCents ?? 0, balanceCents: 0 },
      );
      totals.balanceCents = Math.max(0, (data.pricing?.totalCents ?? totals.subtotalCents) - totals.paidCents);
      drawTotals(ctx, totals, { payments: presentation.showPayments ?? true, balance: presentation.showBalance ?? true }, data.pricing);
    }

    if (data.notes) drawNotes(ctx, data.notes);
    drawFooter(ctx, data);
    doc.end();
  });
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
  const buffer = await renderFieldDocumentPdf(data);
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
  const optionsWithLines = options.map((option) => ({
    id: option.id,
    label: option.label,
    lineItems: optionLines.filter((line) => line.optionId === option.id),
  }));

  const data = estimateDocumentData({
    estimate,
    customer,
    job,
    lineItems: optionsWithLines[0]?.lineItems ?? [],
    org,
  });
  const buffer = await renderFieldDocumentPdf(data);
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

  // Delete the stored copy and regenerate from the current snapshot.
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

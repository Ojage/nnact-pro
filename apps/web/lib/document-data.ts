import { renderFieldDocumentHtml, type FieldDocumentData } from "@ofp/shared";
import type { OrgSettingsDTO } from "@/lib/api";

interface CustomerLike {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface JobLike {
  title: string;
  description?: string | null;
}

interface LineItemLike {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceLike {
  number: string;
  status: string;
  dueAt?: string | null;
  createdAt?: string | null;
  payments?: { amount: number }[];
}

interface EstimateLike {
  id: string;
  accepted: boolean;
  createdAt?: string | null;
}

function issuedDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : new Date().toLocaleDateString();
}

function brandingForDocument(org?: OrgSettingsDTO | null, fallbackFooter = "Field service command center document"): FieldDocumentData["branding"] {
  return {
    companyName: org?.name ?? "OpenFieldPro Demo Co.",
    logoUrl: org?.logoUrl ?? undefined,
    brandColor: org?.brandColor ?? "#22C55E",
    footerText: org?.documentFooter ?? fallbackFooter,
    removeOpenFieldProAttribution: org?.removeOpenFieldProAttribution ?? false,
  };
}

function lineItemsForDocument(lineItems: LineItemLike[], fallbackTotalCents: number): FieldDocumentData["lineItems"] {
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice,
    }));
  }
  return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
}

export function invoiceDocumentHtml({
  invoice,
  customer,
  job,
  lineItems,
  org,
}: {
  invoice: InvoiceLike & { total: number };
  customer: CustomerLike | null;
  job: JobLike | null;
  lineItems: LineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  const paid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  return renderFieldDocumentHtml({
    kind: paid >= invoice.total && invoice.total > 0 ? "receipt" : "invoice",
    number: invoice.number,
    status: invoice.status,
    issuedAt: issuedDate(invoice.createdAt),
    dueAt: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : null,
    customerName: customer?.name ?? "Customer",
    customerEmail: customer?.email,
    customerPhone: customer?.phone,
    jobTitle: job?.title ?? "Service work",
    notes: job?.description ?? null,
    lineItems: lineItemsForDocument(lineItems, invoice.total),
    paymentsCents: paid,
    branding: brandingForDocument(org),
  });
}

export function estimateDocumentHtml({
  estimate,
  customer,
  job,
  lineItems,
  org,
}: {
  estimate: EstimateLike & { total: number };
  customer: CustomerLike | null;
  job: JobLike | null;
  lineItems: LineItemLike[];
  org?: OrgSettingsDTO | null;
}) {
  return renderFieldDocumentHtml({
    kind: "estimate",
    number: `EST-${estimate.id.slice(0, 8).toUpperCase()}`,
    status: estimate.accepted ? "accepted" : "pending",
    issuedAt: issuedDate(estimate.createdAt),
    customerName: customer?.name ?? "Customer",
    customerEmail: customer?.email,
    customerPhone: customer?.phone,
    jobTitle: job?.title ?? "Service work",
    notes: job?.description ?? "Estimate is valid pending final service conditions and customer approval.",
    lineItems: lineItemsForDocument(lineItems, estimate.total),
    paymentsCents: 0,
    branding: brandingForDocument(org, "Estimate generated from OpenFieldPro"),
  });
}

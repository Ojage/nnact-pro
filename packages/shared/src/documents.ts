import type { BusinessSettings } from "./business-settings.js";
import type { CurrencyCode } from "./currency.js";
import { CURRENCY_CATALOG, DEFAULT_CURRENCY, formatMoney } from "./currency.js";

export type FieldDocumentKind = "estimate" | "invoice" | "receipt" | "work_order" | "service_plan";
type DocumentMoney = number;

export interface FieldDocumentBranding {
  companyName: string;
  logoUrl?: string;
  brandColor?: string;
  footerText?: string;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  /** e.g. "TPPRR/RC/BUA/2024/B/09" — printed under the logo, above address/contact. */
  registrationNumber?: string | null;
  removeOpenFieldProAttribution?: boolean;
}

export interface FieldDocumentLineItem {
  description: string;
  quantity: number;
  unitPriceCents: DocumentMoney;
  /** e.g. "No.", "LS", "hrs", "m" — printed in the Unit column. */
  unit?: string | null;
}

export interface FieldDocumentOption {
  id: string;
  label: string;
  selected?: boolean;
  lineItems: FieldDocumentLineItem[];
  pricing?: DocumentPricing;
}

/** Durable pricing breakdown captured when the document total was computed. */
export interface DocumentPricing {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  taxLabel?: string;
  discountLabel?: string;
}

/** Fully programmatic sign-off block — never hardcoded per document. */
export interface DocumentSignatory {
  name?: string | null;
  /** Defaults to "Authorized Signatory" */
  title?: string | null;
  signatureImageUrl?: string | null;
  stampImageUrl?: string | null;
}

export interface FieldDocumentData {
  kind: FieldDocumentKind;
  number: string;
  status?: string;
  issuedAt?: string;
  dueAt?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  jobTitle?: string;
  /** Bold subtitle under the header, e.g. "HOME APPLIANCE REPAIRS AND MAINTENANCE". */
  category?: string | null;
  notes?: string | null;
  lineItems: FieldDocumentLineItem[];
  options?: FieldDocumentOption[];
  paymentsCents?: DocumentMoney;
  pricing?: DocumentPricing;
  branding: FieldDocumentBranding;
  /** Numbered terms & conditions, rendered as an ordered list. */
  termsAndConditions?: string[] | null;
  signatory?: DocumentSignatory | null;
  /** Display currency (defaults to XAF). Mirrors the org business setting. */
  currency?: CurrencyCode;
  presentation?: {
    format?: "email" | "envelope";
    showBusinessInfo?: boolean;
    showLineItemPrices?: boolean;
    showPayments?: boolean;
    showBalance?: boolean;
    /** Show the big "TOTAL: <amount>" line + amount-in-words. Skipped automatically for option-based documents. */
    showAmountInWords?: boolean;
  };
}

export function fieldDocumentTitle(kind: FieldDocumentKind): string {
  switch (kind) {
    case "estimate":
      return "Estimate";
    case "invoice":
      return "Invoice";
    case "receipt":
      return "Receipt";
    case "work_order":
      return "Work Order";
    case "service_plan":
      return "Service Plan";
  }
}

export function fieldDocumentTotals(data: FieldDocumentData) {
  const computedSubtotal = data.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  const subtotalCents = data.pricing?.subtotalCents ?? computedSubtotal;
  const totalCents = data.pricing?.totalCents ?? subtotalCents;
  const paidCents = data.paymentsCents ?? 0;
  return {
    subtotalCents,
    totalCents,
    paidCents,
    balanceCents: Math.max(0, totalCents - paidCents),
  };
}

/** Adjustment rows (discount/tax) for a document with a stored pricing snapshot. */
export function documentPricingRows(pricing: DocumentPricing | undefined): Array<{ label: string; value: number; strong?: boolean }> {
  if (!pricing) return [];
  const rows: Array<{ label: string; value: number; strong?: boolean }> = [];
  if (pricing.discountCents > 0) rows.push({ label: pricing.discountLabel || "Discount", value: -pricing.discountCents });
  if (pricing.taxCents > 0 || pricing.taxLabel) rows.push({ label: pricing.taxLabel || "Tax", value: pricing.taxCents });
  rows.push({ label: "Grand Total", value: pricing.totalCents, strong: true });
  return rows;
}

// ── Amount-in-words ──
// Fully programmatic number → English words converter, used for the
// "Amount in Words" line under the grand total. No document ever hardcodes
// this text; it's always derived from the pricing snapshot + currency.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALE_WORDS = ["", "Thousand", "Million", "Billion", "Trillion"];

function threeDigitsToWords(n: number): string {
  let out = "";
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n > 0) out += " and ";
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10 > 0) out += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out.trim();
}

/** Converts a non-negative integer into English words, e.g. 3250000 → "Three Million Two Hundred and Fifty Thousand". */
export function integerToWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (!Number.isFinite(n) || n === 0) return "Zero";
  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const words = threeDigitsToWords(groups[i]);
    parts.push(SCALE_WORDS[i] ? `${words} ${SCALE_WORDS[i]}` : words);
  }
  return parts.join(" ");
}

/** Currency names as spoken on a printed amount line. Falls back to the currency code. */
const CURRENCY_NAME_WORDS: Partial<Record<CurrencyCode, string>> = {
  XAF: "Francs CFA",
  XOF: "Francs CFA",
  USD: "US Dollars",
  EUR: "Euros",
  GBP: "British Pounds",
  NGN: "Naira",
  GHS: "Ghana Cedis",
  KES: "Kenyan Shillings",
  ZAR: "South African Rand",
};

/** Builds "Three Million Two Hundred and Fifty Thousand Francs CFA Only" from a cents amount + currency. */
export function documentAmountInWords(totalCents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const decimals = (CURRENCY_CATALOG as Record<string, { decimals?: number }>)[currency]?.decimals ?? 0;
  const majorUnits = decimals > 0 ? totalCents / Math.pow(10, decimals) : totalCents;
  const words = integerToWords(majorUnits);
  const currencyName = CURRENCY_NAME_WORDS[currency] ?? currency;
  return `${words} ${currencyName} Only`;
}

export function renderFieldDocumentHtml(data: FieldDocumentData): string {
  const title = fieldDocumentTitle(data.kind);
  const totals = fieldDocumentTotals(data);
  const formatter = (cents: DocumentMoney): string => formatCents(cents, data.currency);
  const color = data.branding.brandColor ?? "#22C55E";
  const currencyCode = data.currency ?? DEFAULT_CURRENCY;
  const currencyLabel = (CURRENCY_CATALOG as Record<string, { code?: string }>)[currencyCode]?.code ?? currencyCode;
  const logo = data.branding.logoUrl
    ? `<img class="logo" src="${escapeHtml(data.branding.logoUrl)}" alt="${escapeHtml(data.branding.companyName)} logo" />`
    : "";
  const companyBadge = `<div class="brand-badge">${escapeHtml(data.branding.companyName)}</div>`;
  const logoFallback = data.branding.logoUrl
    ? ""
    : `<div class="logo-mark">${escapeHtml(data.branding.companyName.slice(0, 2).toUpperCase())}</div>`;
  const attribution = data.branding.removeOpenFieldProAttribution
    ? ""
    : `<p class="attribution">Powered by NNACT Pro</p>`;
  const presentation = data.presentation ?? {};
  const showBusinessInfo = presentation.showBusinessInfo ?? true;
  const showLineItemPrices = presentation.showLineItemPrices ?? true;
  const showPayments = presentation.showPayments ?? true;
  const showBalance = presentation.showBalance ?? true;
  const hasOptions = Boolean(data.options?.length);
  const showAmountInWords = presentation.showAmountInWords ?? !hasOptions;

  const rows = data.lineItems
    .map(
      (item, idx) => `
        <tr>
          <td class="sn">${idx + 1}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${item.unit ? escapeHtml(item.unit) : "—"}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${showLineItemPrices ? formatter(item.unitPriceCents) : "Hidden"}</td>
          <td class="num">${showLineItemPrices ? formatter(item.quantity * item.unitPriceCents) : "Hidden"}</td>
        </tr>`,
    )
    .join("");

  const optionSections = hasOptions
    ? data.options!.map((option) => {
      const optionTotal = option.pricing?.totalCents ?? option.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
      const optionRows = option.lineItems.map((item, idx) => `
        <tr>
          <td class="sn">${idx + 1}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="center">${item.unit ? escapeHtml(item.unit) : "—"}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${showLineItemPrices ? formatter(item.unitPriceCents) : "Hidden"}</td>
          <td class="num">${showLineItemPrices ? formatter(item.quantity * item.unitPriceCents) : "Hidden"}</td>
        </tr>`).join("");
      const selectedLabel = data.status === "approved" ? "Approved" : "Selected";
      return `<section class="option${option.selected ? " selected" : ""}">
        <div class="option-heading"><h2>${escapeHtml(option.label)}</h2>${option.selected ? `<span>${selectedLabel}</span>` : ""}</div>
        <table><thead><tr><th class="sn">SN.</th><th>Description</th><th class="center">Unit</th><th class="num">Qty</th><th class="num">Unit Price (${escapeHtml(currencyLabel)})</th><th class="num">Amount (${escapeHtml(currencyLabel)})</th></tr></thead>
        <tbody>${optionRows}</tbody></table>
        <p class="option-total">Option total <strong>${formatter(optionTotal)}</strong></p>
      </section>`;
    }).join("")
    : null;

  const businessContact = [data.branding.publicPhone, data.branding.publicEmail]
    .filter(Boolean)
    .map((value) => escapeHtml(value!))
    .join(" / ");
  const regLine = data.branding.registrationNumber
    ? `<p class="reg"><strong>Business Registration N°</strong>: ${escapeHtml(data.branding.registrationNumber)}</p>`
    : "";
  const locationLine = showBusinessInfo && data.branding.publicAddress
    ? `<p class="reg"><strong>Location</strong>: ${escapeHtml(data.branding.publicAddress)}</p>`
    : "";
  const contactLine = showBusinessInfo && businessContact
    ? `<p class="reg"><strong>Contact</strong>: ${businessContact}</p>`
    : "";
  const brandBlock = `<div class="brand-block">${logo}${logoFallback}${companyBadge}<div class="brand-meta">${regLine}${locationLine}${contactLine}</div></div>`;

  const categoryLine = data.category
    ? `<p class="category">${escapeHtml(data.category)}</p>`
    : "";

  const notesSection = data.notes?.trim()
    ? `<section class="notes"><p class="notes-body">${escapeHtml(data.notes).replace(/\n/g, "<br />")}</p></section>`
    : "";

  const amountInWordsSection = showAmountInWords
    ? `
    <p class="total-line">TOTAL: ${formatter(totals.totalCents)}</p>
    <p class="words-label">Amount in Words:</p>
    <p class="words">${escapeHtml(documentAmountInWords(totals.totalCents, data.currency))}</p>`
    : "";

  const termsSection = data.termsAndConditions?.length
    ? `<section class="terms">
        <p class="terms-heading">Terms &amp; Conditions</p>
        <ol>${data.termsAndConditions.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol>
      </section>`
    : "";

  const signatoryBlock = `
    <section class="signatory">
      <p>For <span class="underline">${escapeHtml(data.branding.companyName)}</span></p>
      <p class="sig-role">${escapeHtml(data.signatory?.title ?? "Authorized Signatory")}</p>
      <div class="sig-row"><span class="sig-label">Name:</span><span class="sig-value">${data.signatory?.name ? escapeHtml(data.signatory.name) : ""}</span></div>
      <div class="sig-approval">
        <div class="sig-row sig-line"><span class="sig-label">Signature:</span><span class="sig-value sig-media">${data.signatory?.signatureImageUrl ? `<img class="sig-img" src="${escapeHtml(data.signatory.signatureImageUrl)}" alt="Signature" />` : ""}</span></div>
        <div class="sig-row sig-line"><span class="sig-label">Stamp:</span><span class="sig-value sig-media">${data.signatory?.stampImageUrl ? "" : ""}</span></div>
        ${data.signatory?.stampImageUrl ? `<img class="stamp-overlay" src="${escapeHtml(data.signatory.stampImageUrl)}" alt="Stamp" />` : ""}
      </div>
    </section>`;

  const formatClass = presentation.format === "envelope" ? " format-envelope" : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} ${escapeHtml(data.number)}</title>
<style>
  @page{size:letter;margin:0}
  *{box-sizing:border-box}
  body{font-family:ui-serif,Georgia,"Times New Roman",serif;margin:0;background:#eef1ed;color:#111;line-height:1.5}
  .page{position:relative;max-width:820px;min-height:980px;margin:32px auto;background:#fff;border:1px solid #d9dfda;border-radius:4px;padding:48px 48px 48px 56px;box-shadow:0 18px 50px rgba(23,32,27,.1);overflow:hidden}
  .page::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:${color}}
  .page.format-envelope .top{padding-top:76px}

  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:20px}
  .brand-block{display:grid;grid-template-columns:auto auto 1fr;grid-template-rows:auto auto;align-items:start;gap:8px 12px;min-width:0}
  .logo{grid-row:1;grid-column:1;width:52px;height:52px;object-fit:contain}
  .logo-mark{grid-row:1;grid-column:1;width:52px;height:52px;display:grid;place-items:center;border-radius:8px;background:${color};color:#fff;font-weight:900;letter-spacing:-.04em;font-family:ui-sans-serif,system-ui,sans-serif}
  .brand-badge{grid-row:1;grid-column:2;align-self:center;display:inline-block;background:${color};color:#fff;font-weight:800;padding:6px 14px;border-radius:6px;font-size:15px;letter-spacing:.02em;font-family:ui-sans-serif,system-ui,sans-serif;text-transform:uppercase}
  .brand-meta{grid-row:2;grid-column:1/-1}
  .reg{margin:2px 0 0;font-size:11px;line-height:1.5;color:#4b5563}
  .date{font-style:italic;font-size:14px;white-space:nowrap}

  .category{text-align:center;font-weight:800;font-size:15px;letter-spacing:.01em;margin:8px 0 4px;text-transform:uppercase}
  .doc-number{text-align:center;margin:0 0 6px;font-size:14px}
  .doc-title{text-align:center;margin:0 0 22px;font-size:14px}
  .doc-title strong{text-transform:uppercase}

  .boq-heading{text-align:center;font-weight:800;font-size:14px;letter-spacing:.08em;margin:0 0 10px;text-transform:uppercase}

  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px}
  th,td{border:1px solid #111;padding:8px 10px;vertical-align:top}
  th{font-weight:700;background:#f3f4f2;text-align:left}
  .sn{width:36px;text-align:center}
  .center{text-align:center}
  .num{text-align:right;white-space:nowrap}
  tfoot td{font-weight:800}

  .total-line{font-size:26px;font-weight:900;margin:22px 0 14px;letter-spacing:-.01em}
  .words-label{font-weight:800;margin:0 0 2px;font-size:13px}
  .words{font-style:italic;font-weight:700;margin:0 0 18px;font-size:14px}

  .notes{margin:0 0 18px;font-size:13px;line-height:1.6}
  .notes-body{margin:0;white-space:normal}

  .terms{margin:18px 0}
  .terms-heading{font-weight:800;margin:0 0 6px;font-size:13px}
  .terms ol{margin:0;padding-left:20px;font-size:12.5px;line-height:1.7}

  .signatory{margin-top:26px;font-size:13px}
  .underline{text-decoration:underline}
  .sig-role{margin:2px 0 14px}
  .sig-row{display:flex;align-items:flex-end;gap:8px;margin-bottom:14px}
  .sig-label{min-width:82px}
  .sig-value{flex:1;border-bottom:1px solid #111;min-height:22px;padding-bottom:2px}
  .sig-approval{position:relative;min-height:96px;margin-top:4px}
  .sig-line{margin-bottom:18px}
  .sig-media{border-bottom:1px solid #111;display:flex;align-items:flex-end;min-height:44px;padding-bottom:2px}
  .sig-img{max-height:42px;max-width:200px;object-fit:contain}
  .stamp-overlay{position:absolute;left:120px;top:-8px;max-height:110px;max-width:130px;object-fit:contain;opacity:.95;pointer-events:none}

  .option{margin-top:18px}
  .option-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
  .option-heading h2{margin:0;font-size:16px}
  .option-heading span{border-radius:999px;background:${color};color:#fff;padding:4px 8px;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em;font-family:ui-sans-serif,system-ui,sans-serif}
  .option.selected table{outline:2px solid ${color}}
  .option-total{text-align:right;font-size:14px;margin:6px 0 0}

  .footer{display:flex;justify-content:space-between;gap:16px;margin-top:34px;padding-top:14px;border-top:1px solid #dfe5e0;color:#6b776f;font-size:11px;font-family:ui-sans-serif,system-ui,sans-serif}
  .attribution{margin:0;font-weight:750;color:#364139}

  @media(max-width:680px){
    body{background:#fff}
    .page{min-height:100vh;margin:0;border:0;border-radius:0;padding:24px 18px;box-shadow:none}
    .top{flex-direction:column}
    table{font-size:11px}
    th,td{padding:6px}
  }
  @media print{
    body{background:#fff}
    .page{max-width:none;min-height:auto;margin:0;border:0;border-radius:0;padding:0;box-shadow:none}
    .option{break-inside:avoid}
    .signatory{break-inside:avoid}
  }
</style>
</head>
<body>
  <main class="page${formatClass}">
    <section class="top">
      ${brandBlock}
      <p class="date">${escapeHtml(data.issuedAt ?? new Date().toLocaleDateString())}</p>
    </section>

    ${categoryLine}
    <p class="doc-number">${escapeHtml(title)} No.: <strong>${escapeHtml(data.number)}</strong></p>
    <p class="doc-title"><strong>${escapeHtml(data.branding.companyName)} – ${escapeHtml(data.jobTitle ?? title)}</strong></p>

    ${optionSections ?? `
      <p class="boq-heading">Bill of Quantities</p>
      <table>
        <thead><tr><th class="sn">SN.</th><th>Description</th><th class="center">Unit</th><th class="num">Qty</th><th class="num">Unit Price (${escapeHtml(currencyLabel)})</th><th class="num">Amount (${escapeHtml(currencyLabel)})</th></tr></thead>
        <tbody>${rows}
          ${documentPricingRows(data.pricing ?? {
            subtotalCents: totals.subtotalCents,
            discountCents: 0,
            taxCents: 0,
            totalCents: totals.totalCents,
          }).map((row) => `<tr><td colspan="5" class="num">${escapeHtml(row.label.toUpperCase())}</td><td class="num">${formatter(row.value)}</td></tr>`).join("")}
        </tbody>
      </table>
      ${showPayments && !hasOptions && (data.paymentsCents ?? 0) > 0 ? `<p class="num" style="font-size:13px;margin:6px 0">Paid: <strong>${formatter(totals.paidCents)}</strong>${showBalance ? ` — Balance: <strong>${formatter(totals.balanceCents)}</strong>` : ""}</p>` : ""}
    `}

    ${notesSection}
    ${amountInWordsSection}
    ${termsSection}
    ${signatoryBlock}

    <footer class="footer"><span>${escapeHtml(data.branding.footerText ?? "Field service document")}</span>${attribution}</footer>
  </main>
</body>
</html>`;
}

export function formatDocumentCents(cents: DocumentMoney, currency: CurrencyCode = "XAF"): string {
  return formatMoney(cents, currency);
}

function formatCents(cents: DocumentMoney, currency: CurrencyCode = "XAF"): string {
  return formatDocumentCents(cents, currency);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── Durable document data assembly ──
// Shared by the web preview (HTML) and the API (PDF generation + email
// attachment) so a customer document never differs between the two surfaces.

export interface DocumentCustomerLike {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface DocumentJobLike {
  title: string;
  description?: string | null;
}

export interface DocumentLineItemLike {
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string | null;
}

export interface DocumentInvoiceLike {
  number: string;
  status: string;
  dueAt?: string | Date | null;
  createdAt?: string | Date | null;
  payments?: { amount: number }[];
  pricing?: DocumentPricingInput | null;
}

export interface DocumentEstimateLike {
  id: string;
  number?: string;
  accepted: boolean;
  expiresAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  acceptedByName?: string | null;
  createdAt?: string | Date | null;
  status?: string;
  selectedOptionId?: string | null;
  signatureName?: string | null;
  pricing?: DocumentPricingInput | null;
  options?: Array<{ id: string; label: string; lineItems: DocumentLineItemLike[]; pricing?: DocumentPricingInput | null }>;
}

export interface DocumentOrgLike {
  name?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  documentFooter?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  registrationNumber?: string | null;
  documentCategory?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  documentTerms?: string[] | null;
  removeOpenFieldProAttribution?: boolean;
  businessSettings?: BusinessSettings | null;
}

function orgDocumentSignatory(org?: DocumentOrgLike | null, explicit?: DocumentSignatory | null): DocumentSignatory | undefined {
  if (explicit) return explicit;
  if (!org?.signatoryName && !org?.signatureUrl && !org?.stampUrl) return undefined;
  return {
    name: org.signatoryName,
    title: org.signatoryTitle ?? "Authorized Signatory",
    signatureImageUrl: org.signatureUrl,
    stampImageUrl: org.stampUrl,
  };
}

function orgDocumentTerms(org?: DocumentOrgLike | null, explicit?: string[] | null, fallback?: string[] | null): string[] | undefined {
  if (explicit?.length) return explicit;
  if (org?.documentTerms?.length) return org.documentTerms;
  return fallback?.length ? fallback : undefined;
}

function documentIssuedDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : new Date().toLocaleDateString();
}

function documentBranding(org?: DocumentOrgLike | null, fallbackFooter = "Field service command center document"): FieldDocumentData["branding"] {
  return {
    companyName: org?.name ?? "NNACT",
    logoUrl: org?.logoUrl ?? undefined,
    brandColor: org?.brandColor ?? "#22C55E",
    footerText: org?.documentFooter ?? fallbackFooter,
    publicEmail: org?.publicEmail,
    publicPhone: org?.publicPhone,
    publicAddress: org?.publicAddress,
    registrationNumber: org?.registrationNumber,
    removeOpenFieldProAttribution: org?.removeOpenFieldProAttribution ?? false,
  };
}

function documentLineItems(lineItems: DocumentLineItemLike[], fallbackTotalCents: number): FieldDocumentData["lineItems"] {
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice,
      unit: item.unit ?? undefined,
    }));
  }
  return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
}

function visibleDocumentLineItems(
  lineItems: DocumentLineItemLike[],
  fallbackTotalCents: number,
  options: { showLineItems: boolean },
) {
  if (!options.showLineItems) return [{ description: "Service work", quantity: 1, unitPriceCents: fallbackTotalCents }];
  return documentLineItems(lineItems, fallbackTotalCents);
}

function joinDocumentNotes(parts: (string | null | undefined)[]) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join("\n\n");
}

/** Builds the durable document data for an invoice from its snapshot lines. */
export function invoiceDocumentData({
  invoice,
  customer,
  job,
  lineItems,
  org,
  signatory,
  termsAndConditions,
  category,
}: {
  invoice: DocumentInvoiceLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: DocumentOrgLike | null;
  signatory?: DocumentSignatory | null;
  termsAndConditions?: string[] | null;
  category?: string | null;
}): FieldDocumentData {
  const paid = invoice.payments?.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  const settings = org?.businessSettings;
  const visibility = settings?.invoice.visibility;
  return {
    kind: paid >= invoice.total && invoice.total > 0 ? "receipt" : "invoice",
    number: invoice.number,
    status: invoice.status,
    issuedAt: documentIssuedDate(invoice.createdAt),
    dueAt: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    category: category ?? org?.documentCategory,
    notes: joinDocumentNotes([job?.description, settings?.invoice.defaultMessage, settings?.invoice.paymentInstructions]),
    lineItems: visibleDocumentLineItems(lineItems, invoice.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    paymentsCents: paid,
    pricing: documentPricing(invoice.pricing),
    branding: documentBranding(org),
    termsAndConditions: orgDocumentTerms(org, termsAndConditions),
    signatory: orgDocumentSignatory(org, signatory),
    currency: settings?.currency ?? DEFAULT_CURRENCY,
    presentation: {
      format: settings?.invoice.format,
      showBusinessInfo: visibility?.showBusinessInfo ?? true,
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
      showPayments: visibility?.showPayments ?? true,
      showBalance: visibility?.showBalance ?? true,
    },
  };
}

/** Raw stored snapshot shape accepted by documentPricing (PricingSnapshot-compatible). */
export type DocumentPricingInput = {
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  taxLabel?: string;
  discountLabel?: string;
};

/** Maps a stored PricingSnapshot onto the document-facing pricing shape. */
export function documentPricing(
  pricing: DocumentPricingInput | null | undefined,
): DocumentPricing | undefined {
  if (!pricing || typeof pricing.total !== "number") return undefined;
  return {
    subtotalCents: pricing.subtotal ?? 0,
    discountCents: pricing.discount ?? 0,
    taxCents: pricing.tax ?? 0,
    totalCents: pricing.total,
    taxLabel: pricing.taxLabel,
    discountLabel: pricing.discountLabel,
  };
}

/** Builds the durable document data for an estimate from its option lines. */
export function estimateDocumentData({
  estimate,
  customer,
  job,
  lineItems,
  org,
  signatory,
  termsAndConditions,
  category,
}: {
  estimate: DocumentEstimateLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  org?: DocumentOrgLike | null;
  signatory?: DocumentSignatory | null;
  termsAndConditions?: string[] | null;
  category?: string | null;
}): FieldDocumentData {
  const settings = org?.businessSettings;
  const visibility = settings?.estimate.visibility;
  return {
    kind: "estimate",
    number: estimate.number ?? `${settings?.numbering.estimatePrefix ?? "EST"}-${estimate.id.slice(0, 8).toUpperCase()}`,
    status: estimate.status ?? (estimate.accepted ? "approved" : "pending"),
    issuedAt: documentIssuedDate(estimate.createdAt),
    dueAt: estimate.expiresAt ? new Date(estimate.expiresAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    category: category ?? org?.documentCategory,
    notes: joinDocumentNotes([
      job?.description,
      settings?.estimate.defaultMessage ?? "Estimate is valid pending final service conditions and customer approval.",
      estimate.acceptedAt ? `Accepted ${new Date(estimate.acceptedAt).toLocaleDateString()}${estimate.acceptedByName ? ` by ${estimate.acceptedByName}` : ""}.` : null,
      settings?.estimate.signatureRequired ? "Customer signature required for approval." : null,
      settings?.estimate.depositMode !== "none"
        ? `Deposit required: ${settings?.estimate.depositValue}${settings?.estimate.depositMode === "percent" ? "%" : ` ${CURRENCY_CATALOG[settings?.currency ?? DEFAULT_CURRENCY].symbol}`}`
        : null,
    ]),
    lineItems: visibleDocumentLineItems(lineItems, estimate.total, {
      showLineItems: visibility?.showLineItems ?? true,
    }),
    options: visibility?.showOptionSummary === false ? undefined : estimate.options?.map((option) => ({
      id: option.id,
      label: option.label,
      selected: option.id === estimate.selectedOptionId,
      lineItems: visibleDocumentLineItems(option.lineItems, 0, { showLineItems: visibility?.showLineItems ?? true }),
      pricing: documentPricing(option.pricing),
    })),
    pricing: documentPricing(estimate.pricing),
    paymentsCents: 0,
    branding: documentBranding(org, "Estimate generated from NNACT Pro"),
    termsAndConditions: orgDocumentTerms(org, termsAndConditions, [
      "Quotation is valid for 30 days from the date of issue.",
      "Prices include the supply of the listed equipment, transportation, installation, testing and commissioning as specified.",
      "Payment terms shall be agreed upon with the client and formalized through a service agreement.",
    ]),
    signatory: orgDocumentSignatory(org, signatory),
    currency: settings?.currency ?? DEFAULT_CURRENCY,
    presentation: {
      format: settings?.estimate.format,
      showBusinessInfo: visibility?.showBusinessInfo ?? true,
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
    },
  };
}
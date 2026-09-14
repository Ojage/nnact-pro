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

/** A verified appliance/equipment linked to the work, shown on the estimate. */
export interface DocumentEquipment {
  type?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  location?: string | null;
  notes?: string | null;
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
  /** Customer/clinic/company name shown under "Prepared for". */
  company?: string | null;
  /** Service address when known. */
  customerAddress?: string | null;
  /** The job's on-site service location, shown in the "Regarding" block. */
  serviceAddress?: string | null;
  jobTitle?: string;
  /** Job / diagnostic reference printed next to the work. */
  reference?: string | null;
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
  /** Customer-facing scope-of-work bullets. Never contains internal shorthand. */
  scope?: string[] | null;
  recommendations?: string | null;
  equipment?: DocumentEquipment[];
  revision?: number | null;
  accepted?: boolean;
  acceptedByName?: string | null;
  acceptedAt?: string | null;
  /** How the estimate was accepted: customer signature/electronic, or office staff recording approval. */
  acceptedMethod?: "signature" | "electronic" | "office_approve" | "office_accept" | null;
  selectedOptionLabel?: string | null;
  deposit?: { requiredCents: number; balanceCents: number; label: string };
  /** Display currency (defaults to XAF). Mirrors the org business setting. */
  currency?: CurrencyCode;
  presentation?: {
    format?: "email" | "envelope";
    showBusinessInfo?: boolean;
    showLineItemPrices?: boolean;
    showPayments?: boolean;
    showBalance?: boolean;
    /** Show the big "TOTAL: <amount>" line + amount-in-words. */
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
  const currencyInfo = CURRENCY_CATALOG[currencyCode];
  const currencySymbol = currencyInfo?.symbol ?? currencyCode;
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
  const showAmountInWords = presentation.showAmountInWords ?? Boolean(!hasOptions || data.selectedOptionLabel || data.accepted);

  const issueDate = documentDateLabel(data.issuedAt);
  const validUntil = documentDateLabel(data.dueAt);

  const hasAnyUnits = [...(data.lineItems ?? []), ...(data.options ?? []).flatMap((option) => option.lineItems)]
    .some((item) => Boolean(item.unit?.trim()));

  function lineCells(item: FieldDocumentLineItem, idx: number) {
    return `
      <tr>
        <td class="sn">${idx + 1}</td>
        <td class="desc">${escapeHtml(item.description)}</td>
        ${hasAnyUnits ? `<td class="center">${item.unit ? escapeHtml(item.unit) : "&ndash;"}</td>` : ""}
        <td class="num">${item.quantity}</td>
        <td class="num">${showLineItemPrices ? formatter(item.unitPriceCents) : "Hidden"}</td>
        <td class="num">${showLineItemPrices ? formatter(item.quantity * item.unitPriceCents) : "Hidden"}</td>
      </tr>`;
  }

  function pricingRows(pricing: DocumentPricing | undefined) {
    const rows = documentPricingRows(pricing);
    return rows.map((row) => `<tr class="${row.strong ? "strong" : ""}"><td colspan="${hasAnyUnits ? 5 : 4}" class="num label">${escapeHtml(row.label.toUpperCase())}</td><td class="num">${formatter(row.value)}</td></tr>`).join("");
  }

  const tableHead = `<thead><tr><th class="sn">SN.</th><th>Description</th>${hasAnyUnits ? `<th class="center">Unit</th>` : ""}<th class="num">Qty</th><th class="num">Unit Price (${escapeHtml(currencySymbol)})</th><th class="num">Amount (${escapeHtml(currencySymbol)})</th></tr></thead>`;

  const rows = (data.lineItems ?? []).map(lineCells).join("");

  const optionSections = hasOptions
    ? data.options!.map((option, position) => {
      const letter = String.fromCharCode(65 + position);
      const optionTotal = option.pricing?.totalCents ?? option.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
      const optionRows = option.lineItems.map(lineCells).join("");
      const badge = option.selected
        ? `<span class="badge ${data.status === "approved" ? "approve" : ""}">${data.status === "approved" ? "Approved" : "Selected"}</span>`
        : "";
      return `<section class="option">
        <div class="option-heading"><span class="option-tag">Option ${letter}</span><h3>${escapeHtml(option.label)}</h3>${badge}</div>
        <table>${tableHead}<tbody>${optionRows}${pricingRows(option.pricing)}</tbody></table>
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

  const datesBlock = `
    <div class="doc-dates">
      ${issueDate ? `<p class="doc-line"><span>Issue date</span><strong>${escapeHtml(issueDate)}</strong></p>` : ""}
      ${validUntil ? `<p class="doc-line"><span>Valid until</span><strong>${escapeHtml(validUntil)}</strong></p>` : ""}
    </div>`;

  const categoryLine = data.category
    ? `<p class="category">${escapeHtml(data.category)}</p>`
    : "";

  const revisionLine = data.revision && data.revision > 1
    ? `<span class="doc-revision">Revision ${data.revision}</span>`
    : "";

  // Parties: who the estimate is for + what it relates to.
  const partiesSection = `
    <section class="parties">
      <div class="party">
        <p class="party-label">Prepared for</p>
        <p class="party-name">${escapeHtml(data.customerName || "Customer")}</p>
        ${data.company ? `<p class="party-line">${escapeHtml(data.company)}</p>` : ""}
        ${data.customerPhone ? `<p class="party-line">Tel: ${escapeHtml(data.customerPhone)}</p>` : ""}
        ${data.customerEmail ? `<p class="party-line">${escapeHtml(data.customerEmail)}</p>` : ""}
        ${data.customerAddress ? `<p class="party-line">${escapeHtml(data.customerAddress).replace(/\n/g, ", ")}</p>` : ""}
      </div>
      <div class="party">
        <p class="party-label">Regarding</p>
        <p class="party-name">${escapeHtml(data.jobTitle ?? title)}</p>
        ${data.reference ? `<p class="party-line">Ref: ${escapeHtml(data.reference)}</p>` : ""}
        ${data.serviceAddress ? `<p class="party-line">${escapeHtml(data.serviceAddress)}</p>` : ""}
      </div>
    </section>`;

  // Equipment the work relates to (only fields actually known).
  const equipmentSection = data.equipment?.length
    ? `<section class="equipment">
        <h2 class="section-heading">Equipment</h2>
        ${data.equipment.map((item) => {
          const raw: Array<[string, string | null | undefined]> = [
            ["Type", item.type],
            ["Make", item.make],
            ["Model", item.model],
            ["Serial No.", item.serialNumber],
            ["Capacity", item.capacity],
            ["Location", item.location],
          ];
          const kv: Array<[string, string]> = [];
          for (const [label, value] of raw) {
            if (value && String(value).trim()) kv.push([label, String(value)]);
          }
          return `<div class="equip">
            <table class="kv">${kv.map(([label, value]) => `<tr><td class="kv-key">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
          </div>`;
        }).join("")}
      </section>`
    : "";

  // Customer-facing scope of work. Never derived from internal technician notes.
  const scopeSection = data.scope?.length
    ? `<section class="scope-block">
        <h2 class="section-heading">Scope of work</h2>
        <ul class="scope-list">${data.scope.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>`
    : "";

  const recommendationsSection = data.recommendations?.trim()
    ? `<section class="notes"><h2 class="section-heading">Recommendations</h2><p class="notes-body">${escapeHtml(data.recommendations.trim()).replace(/\n/g, "<br />")}</p></section>`
    : "";

  const headingForPricing = hasOptions
    ? '<p class="boq-heading">Pricing Options</p>'
    : '<p class="boq-heading">Bill of Quantities</p>';

  const singlePricing = optionSections ?? `
    <table>
      ${tableHead}
      <tbody>${rows}${pricingRows(data.pricing ?? {
        subtotalCents: totals.subtotalCents,
        discountCents: 0,
        taxCents: 0,
        totalCents: totals.totalCents,
      })}</tbody>
    </table>
    ${showPayments && !hasOptions && (data.paymentsCents ?? 0) > 0 ? `<p class="paid-line">Paid: <strong>${formatter(totals.paidCents)}</strong>${showBalance ? ` — Balance: <strong>${formatter(totals.balanceCents)}</strong>` : ""}</p>` : ""}
  `;

  // Financial summary: the estimate total (selected/only option) + deposit.
  const financialRows = documentPricingRows(data.pricing ?? {
    subtotalCents: totals.subtotalCents,
    discountCents: 0,
    taxCents: 0,
    totalCents: totals.totalCents,
  });
  const financialSummary = `
    <section class="summary">
      <div class="summary-block">
        ${financialRows.map((row) => `<div class="summary-row${row.strong ? " strong" : ""}"><span>${escapeHtml(row.label)}</span><span>${formatter(row.value)}</span></div>`).join("")}
        ${data.deposit ? `
          <div class="summary-row deposit"><span>Deposit required</span><span>${formatter(data.deposit.requiredCents)}</span></div>
          <div class="summary-row deposit"><span>Balance on completion</span><span>${formatter(data.deposit.balanceCents)}</span></div>
          <p class="deposit-note">${escapeHtml(data.deposit.label)}</p>` : ""}
      </div>
    </section>`;

  const totalLine = showAmountInWords
    ? `
    <p class="total-line">TOTAL ${hasOptions && data.selectedOptionLabel ? `${escapeHtml(data.selectedOptionLabel.toUpperCase())} » ` : ""}${hasOptions && !data.selectedOptionLabel ? "» " : ""}${formatter(totals.totalCents)}</p>
    <p class="words-label">Amount in Words:</p>
    <p class="words">${escapeHtml(documentAmountInWords(totals.totalCents, data.currency))}</p>`
    : "";

  const notesSection = data.notes?.trim()
    ? `<section class="notes"><h2 class="section-heading">Notes</h2><p class="notes-body">${escapeHtml(data.notes).replace(/\n/g, "<br />")}</p></section>`
    : "";

  const termsSection = data.termsAndConditions?.length
    ? `<section class="terms">
        <h2 class="section-heading">Terms &amp; Conditions</h2>
        <ol>${data.termsAndConditions.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}</ol>
      </section>`
    : "";

  // NNACT authorization (left) + customer acceptance (right) in one compact grid.
  const signatoryBlock = `
    <section class="signatures">
      <div class="signature-col">
        <p class="party-label">Prepared by — ${escapeHtml(data.branding.companyName)}</p>
        <p class="sig-role">${escapeHtml(data.signatory?.title ?? "Authorized Signatory")}</p>
        <div class="sig-row"><span class="sig-label">Name:</span><span class="sig-value">${data.signatory?.name ? escapeHtml(data.signatory.name) : ""}</span></div>
        <div class="sig-row sig-line"><span class="sig-label">Signature:</span><span class="sig-value sig-media">${data.signatory?.signatureImageUrl ? `<img class="sig-img" src="${escapeHtml(data.signatory.signatureImageUrl)}" alt="Signature" />` : ""}</span></div>
        <div class="sig-row"><span class="sig-label">Date:</span><span class="sig-value">${issueDate ? escapeHtml(issueDate) : ""}</span></div>
        ${data.signatory?.stampImageUrl ? `<img class="stamp-overlay" src="${escapeHtml(data.signatory.stampImageUrl)}" alt="Stamp" />` : ""}
      </div>
      ${data.accepted || (data.termsAndConditions?.length || data.acceptedMethod)
        ? `<div class="signature-col acceptance">
            <p class="party-label">Customer Acceptance</p>
            ${data.accepted ? `
              <p class="accepted-text">Accepted ${data.acceptedMethod === "electronic" ? "electronically" : "by signature"}${data.acceptedByName ? ` by <strong>${escapeHtml(data.acceptedByName)}</strong>` : ""}${data.acceptedAt ? ` on ${escapeHtml(documentDateLabel(data.acceptedAt))}` : ""}.</p>
              ${data.selectedOptionLabel ? `<p class="accepted-text">Selected option: <strong>${escapeHtml(data.selectedOptionLabel)}</strong></p>` : ""}
            ` : `
              ${data.selectedOptionLabel ? `<div class="sig-row"><span class="sig-label">Option:</span><span class="sig-value">${escapeHtml(data.selectedOptionLabel)}</span></div>` : ""}
              <div class="sig-row"><span class="sig-label">Name:</span><span class="sig-value">&nbsp;</span></div>
              <div class="sig-row sig-line"><span class="sig-label">Signature:</span><span class="sig-value sig-line-value">&nbsp;</span></div>
              <div class="sig-row"><span class="sig-label">Date:</span><span class="sig-value">&nbsp;</span></div>
            `}
          </div>`
        : ""}
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
  body{font-family:ui-serif,Georgia,"Times New Roman",serif;margin:0;background:#eef1ed;color:#151a17;line-height:1.5}
  .page{position:relative;max-width:820px;min-height:980px;margin:32px auto;background:#fff;border:1px solid #d9dfda;border-radius:4px;padding:48px 48px 48px 56px;box-shadow:0 18px 50px rgba(23,32,27,.1)}
  .page::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:${color}}
  .page.format-envelope .top{padding-top:76px}

  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:8px}
  .brand-block{display:grid;grid-template-columns:auto auto 1fr;grid-template-rows:auto auto;align-items:start;gap:8px 12px;min-width:0}
  .logo{grid-row:1;grid-column:1;width:52px;height:52px;object-fit:contain}
  .logo-mark{grid-row:1;grid-column:1;width:52px;height:52px;display:grid;place-items:center;border-radius:8px;background:${color};color:#fff;font-weight:900;letter-spacing:-.04em;font-family:ui-sans-serif,system-ui,sans-serif}
  .brand-badge{grid-row:1;grid-column:2;align-self:center;display:inline-block;background:${color};color:#fff;font-weight:800;padding:6px 14px;border-radius:6px;font-size:15px;letter-spacing:.02em;font-family:ui-sans-serif,system-ui,sans-serif;text-transform:uppercase}
  .brand-meta{grid-row:2;grid-column:1/-1}
  .reg{margin:2px 0 0;font-size:11px;line-height:1.5;color:#4b5563}

  .doc-dates{text-align:right;white-space:nowrap}
  .doc-line{margin:0 0 4px;font-size:12px;display:flex;gap:8px;justify-content:flex-end}
  .doc-line span{color:#6b776f}
  .doc-line strong{font-family:ui-sans-serif,system-ui,sans-serif;font-weight:600}
  .doc-revision{display:inline-block;margin-left:8px;font-size:11px;font-weight:800;color:#b45309;border:1px solid #fcd34d;border-radius:999px;padding:2px 8px;vertical-align:middle}

  .doc-identity{text-align:center;margin:6px 0 18px}
  .category{font-weight:800;font-size:13px;letter-spacing:.12em;margin:0 0 4px;text-transform:uppercase;color:#4b5563}
  .doc-title{margin:0;font-size:24px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
  .doc-number{margin:6px 0 4px;font-size:14px;color:#37423c}
  .doc-number strong{font-family:ui-sans-serif,system-ui,sans-serif}

  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0 0 18px}
  .party{background:#f7f9f7;border:1px solid #e3e8e3;border-radius:8px;padding:12px 14px}
  .party-label{margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6b776f}
  .party-name{margin:0 0 4px;font-size:15px;font-weight:800}
  .party-line{margin:0;font-size:12px;color:#37423c}

  h2.section-heading{font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:800;letter-spacing:.10em;text-transform:uppercase;margin:0 0 8px;color:#151a17}

  .equipment{margin:0 0 16px}
  .equip{margin-bottom:10px}
  table.kv{width:100%;border-collapse:collapse;font-size:12px;margin:0}
  table.kv td{border:1px solid #d9dfda;padding:5px 8px;vertical-align:top}
  .kv-key{width:120px;font-weight:700;background:#f7f9f7;white-space:nowrap}

  .scope-block{margin:0 0 16px}
  .scope-list{margin:0;padding-left:18px;font-size:13px;line-height:1.7}
  .scope-list li::marker{color:${color}}

  .boq-heading{font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;font-weight:800;font-size:13px;letter-spacing:.1em;margin:0 0 10px;text-transform:uppercase}

  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:4px}
  th,td{border:1px solid #c9d0ca;padding:7px 9px;vertical-align:top}
  th{font-weight:700;background:#f3f5f3;text-align:left}
  .sn{width:32px;text-align:center}
  .center{text-align:center}
  .num{text-align:right;white-space:nowrap}
  .desc{overflow-wrap:anywhere}
  tr.strong td{font-weight:800;background:#f7f9f7}
  td.label{font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px}

  .option{margin-top:16px;break-inside:avoid}
  .option-heading{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .option-tag{font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:800;letter-spacing:.06em;color:#fff;background:${color};border-radius:6px;padding:3px 8px;text-transform:uppercase}
  .option-heading h3{margin:0;font-size:16px}
  .option-heading .badge{border-radius:999px;background:${color};color:#fff;padding:3px 8px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-family:ui-sans-serif,system-ui,sans-serif}
  .option-heading .badge.approve{background:#15803d}

  .summary{margin:18px 0 4px}
  .summary-block{max-width:360px;margin-left:auto}
  .summary-row{display:flex;justify-content:space-between;gap:16px;padding:4px 0;font-size:13px;border-bottom:1px dotted #d9dfda}
  .summary-row.strong{font-weight:800;font-size:14px;border-bottom:none}
  .summary-row.deposit{font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px}
  .deposit-note{margin:4px 0 0;font-size:11.5px;color:#4b5563}

  .total-line{font-size:24px;font-weight:900;margin:20px 0 12px;letter-spacing:-.01em;text-align:right}
  .words-label{font-weight:800;margin:0 0 2px;font-size:13px}
  .words{font-style:italic;font-weight:700;margin:0 0 16px;font-size:14px;color:#37423c}

  .notes{margin:0 0 16px;font-size:13px;line-height:1.6}
  .notes-body{margin:0;white-space:normal}

  .terms{margin:16px 0}
  .terms ol{margin:0;padding-left:18px;font-size:12.5px;line-height:1.7}

  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px;break-inside:avoid}
  .signature-col{position:relative}
  .sig-role{margin:2px 0 12px;font-size:13px;color:#37423c}
  .sig-row{display:flex;align-items:flex-end;gap:8px;margin-bottom:12px;font-size:13px}
  .sig-label{min-width:74px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px}
  .sig-value{flex:1;border-bottom:1px solid #151a17;min-height:22px;padding-bottom:2px}
  .sig-line-value{border-bottom:1px solid #151a17}
  .sig-media{border-bottom:1px solid #151a17;display:flex;align-items:flex-end;min-height:44px;padding-bottom:2px}
  .sig-img{max-height:42px;max-width:200px;object-fit:contain}
  .stamp-overlay{position:absolute;right:0;top:54px;max-height:96px;max-width:130px;object-fit:contain;opacity:.9;pointer-events:none}
  .accepted-text{margin:0 0 6px;font-size:13px}

  .footer{display:flex;justify-content:space-between;gap:16px;margin-top:28px;padding-top:12px;border-top:1px solid #dfe5e0;color:#6b776f;font-size:11px;font-family:ui-sans-serif,system-ui,sans-serif}
  .attribution{margin:0;font-weight:700;color:#3f4a44}

  @media(max-width:680px){
    body{background:#fff}
    .page{min-height:100vh;margin:0;border:0;border-radius:0;padding:28px 20px 28px 34px;box-shadow:none}
    .top{flex-direction:column}
    .doc-dates{text-align:left;align-items:flex-start}
    .doc-line{justify-content:flex-start}
    .parties{grid-template-columns:1fr}
    .signatures{grid-template-columns:1fr}
    table{font-size:11px}
    th,td{padding:6px}
  }
  @media print{
    body{background:#fff}
    .page{max-width:none;min-height:0;height:auto;margin:0;border:0;border-radius:0;padding:36px 44px 36px 64px;box-shadow:none;overflow:visible}
    .option{break-inside:avoid}
    .signatures{break-inside:avoid}
    .equipment{break-inside:avoid}
    .summary{break-inside:avoid}
    .parties{break-inside:avoid}
    thead{display:table-header-group}
    tr{break-inside:avoid}
  }
</style>
</head>
<body>
  <main class="page${formatClass}">
    <section class="top">
      ${brandBlock}
      <div class="doc-dates">${datesBlock}</div>
    </section>

    <div class="doc-identity">
      ${categoryLine}
      <p class="doc-title">${escapeHtml(title)}${data.kind === "estimate" ? " / Quotation" : ""}</p>
      <p class="doc-number">No.: <strong>${escapeHtml(data.number)}</strong>${revisionLine}</p>
    </div>

    ${partiesSection}
    ${equipmentSection}
    ${scopeSection}
    ${recommendationsSection}

    ${headingForPricing}
    ${singlePricing}
    ${financialSummary}
    ${totalLine}

    ${notesSection}
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
  address?: string | null;
  company?: string | null;
}

export interface DocumentEquipmentLike {
  type?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  location?: string | null;
}

export interface DocumentJobLike {
  title: string;
  description?: string | null;
  number?: string | null;
  serviceAddress?: string | null;
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
  /** Customer-facing scope-of-work copy. Never technician shorthand. */
  scope?: string | null;
  recommendations?: string | null;
  exclusions?: string | null;
  paymentTerms?: string | null;
  warrantyTerms?: string | null;
  /** Overrides the org's estimate validity policy for this document. */
  validityDays?: number | null;
  revision?: number | null;
  acceptedMethod?: "signature" | "electronic" | "office_approve" | "office_accept" | null;
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

const DOC_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Renders a parseable date as "13 Sep 2026". Returns "" for invalid/empty input. */
export function documentDateLabel(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DOC_DATE_FORMAT.format(date);
}

/** Splits free text into trimmed customer-facing bullet points. */
export function splitDocumentBullets(text?: string | null): string[] {
  return (text ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•·.–]+\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Builds the terms actually true for a given estimate. Explicit per-estimate
 * terms override everything; otherwise org-curated terms are followed by
 * computed policy terms (validity, payment, warranty, deposit, signature) and
 * exclusions. No blanket "prices include..." claim is ever printed.
 */
export function buildEstimateTerms(input: {
  estimate: {
    validityDays?: number | null;
    paymentTerms?: string | null;
    warrantyTerms?: string | null;
    exclusions?: string | null;
  };
  settings?: {
    expirationDays?: number;
    depositMode?: "none" | "fixed" | "percent";
    depositValue?: number;
    signatureRequired?: boolean;
    paymentTerms?: string;
    warrantyTerms?: string;
    defaultExclusions?: string;
  };
  orgTerms?: string[] | null;
  explicit?: string[] | null;
  currency: CurrencyCode;
}): string[] {
  if (input.explicit?.length) return [...input.explicit];
  const terms: string[] = [];
  if (input.orgTerms?.length) terms.push(...input.orgTerms);
  const settings = input.settings;
  const days = input.estimate.validityDays ?? settings?.expirationDays;
  if (days && days > 0) terms.push(`This estimate is valid for ${days} days from the date of issue.`);
  const payment = input.estimate.paymentTerms?.trim() || settings?.paymentTerms?.trim();
  if (payment) terms.push(payment);
  const warranty = input.estimate.warrantyTerms?.trim() || settings?.warrantyTerms?.trim();
  if (warranty) terms.push(warranty);
  if (settings?.depositMode && settings.depositMode !== "none") {
    const label = settings.depositMode === "percent"
      ? `${settings.depositValue}%`
      : formatDocumentCents(settings.depositValue ?? 0, input.currency);
    terms.push(`An initial deposit of ${label} is required to confirm the work.`);
  }
  if (settings?.signatureRequired) terms.push("Work will begin only after this estimate is accepted by the customer.");
  const exclusions = input.estimate.exclusions?.trim() || settings?.defaultExclusions?.trim();
  if (exclusions) terms.push(...splitDocumentBullets(exclusions));
  return terms;
}

/** Deposits required for an estimate from the org policy. */
export function estimateDeposit(input: {
  settings?: {
    depositMode?: "none" | "fixed" | "percent";
    depositValue?: number;
  };
  totalCents: number;
  currency: CurrencyCode;
}): { requiredCents: number; balanceCents: number; label: string } | undefined {
  const mode = input.settings?.depositMode;
  const value = input.settings?.depositValue ?? 0;
  if (!mode || mode === "none" || value <= 0) return undefined;
  const requiredCents = mode === "percent"
    ? Math.round((input.totalCents * Math.min(100, Math.max(0, value))) / 100)
    : Math.min(value, input.totalCents);
  const balanceCents = Math.max(0, input.totalCents - requiredCents);
  const label = mode === "percent"
    ? `${value}% deposit required to confirm the work.`
    : `${formatDocumentCents(requiredCents, input.currency)} deposit required to confirm the work.`;
  return { requiredCents, balanceCents, label };
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
    company: visibility?.showCustomerInfo === false ? null : customer?.company,
    customerAddress: visibility?.showCustomerInfo === false ? null : customer?.address,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    reference: visibility?.showJobInfo === false ? null : job?.number,
    serviceAddress: visibility?.showJobInfo === false ? null : job?.serviceAddress,
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
  equipment,
  org,
  signatory,
  termsAndConditions,
  category,
  serviceAddress,
}: {
  estimate: DocumentEstimateLike & { total: number };
  customer: DocumentCustomerLike | null;
  job: DocumentJobLike | null;
  lineItems: DocumentLineItemLike[];
  equipment?: DocumentEquipmentLike[];
  org?: DocumentOrgLike | null;
  signatory?: DocumentSignatory | null;
  termsAndConditions?: string[] | null;
  category?: string | null;
  serviceAddress?: string | null;
}): FieldDocumentData {
  const settings = org?.businessSettings;
  const visibility = settings?.estimate.visibility;
  const currency = settings?.currency ?? DEFAULT_CURRENCY;
  const selectedOption = estimate.options?.find((option) => option.id === estimate.selectedOptionId);
  const selectedOptionLabel = selectedOption?.label;
  const totalCents = estimate.pricing?.total ?? (selectedOption?.pricing?.total ?? estimate.total ?? 0);
  const deposit = estimateDeposit({ settings: settings?.estimate, totalCents, currency });
  return {
    kind: "estimate",
    number: estimate.number ?? `${settings?.numbering.estimatePrefix ?? "EST"}-${estimate.id.slice(0, 8).toUpperCase()}`,
    status: estimate.status ?? (estimate.accepted ? "approved" : "pending"),
    issuedAt: documentIssuedDate(estimate.createdAt),
    dueAt: estimate.expiresAt ? new Date(estimate.expiresAt).toLocaleDateString() : null,
    customerName: visibility?.showCustomerInfo === false ? "Customer" : customer?.name ?? "Customer",
    customerEmail: visibility?.showCustomerInfo === false ? null : customer?.email,
    customerPhone: visibility?.showCustomerInfo === false ? null : customer?.phone,
    company: visibility?.showCustomerInfo === false ? null : customer?.company,
    customerAddress: visibility?.showCustomerInfo === false ? null : customer?.address,
    jobTitle: visibility?.showJobInfo === false ? "Service work" : job?.title ?? "Service work",
    reference: visibility?.showJobInfo === false ? null : job?.number,
    serviceAddress: visibility?.showJobInfo === false ? null : (serviceAddress ?? job?.serviceAddress),
    category: category ?? org?.documentCategory,
    // Notes are the professional default message + lifecycle facts only. Raw
    // technician shorthand is stored separately and never printed here.
    notes: joinDocumentNotes([
      settings?.estimate.defaultMessage ?? "Estimate is valid pending final service conditions and customer approval.",
      estimate.acceptedAt ? `Accepted ${new Date(estimate.acceptedAt).toLocaleDateString()}${estimate.acceptedByName ? ` by ${estimate.acceptedByName}` : ""}.` : null,
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
    termsAndConditions: (() => {
      const terms = buildEstimateTerms({ estimate, settings: settings?.estimate, orgTerms: org?.documentTerms, explicit: termsAndConditions, currency });
      return terms.length ? terms : undefined;
    })(),
    signatory: orgDocumentSignatory(org, signatory),
    currency,
    scope: splitDocumentBullets(estimate.scope),
    recommendations: estimate.recommendations?.trim() ?? undefined,
    equipment: equipment?.map((item) => ({
      type: item.type,
      make: item.make,
      model: item.model,
      serialNumber: item.serialNumber,
      capacity: item.capacity,
      location: item.location,
    })),
    revision: estimate.revision,
    accepted: estimate.accepted,
    acceptedByName: estimate.acceptedByName,
    acceptedAt: estimate.acceptedAt ? new Date(estimate.acceptedAt).toLocaleDateString() : undefined,
    acceptedMethod: estimate.acceptedMethod,
    selectedOptionLabel,
    deposit,
    presentation: {
      format: settings?.estimate.format,
      showBusinessInfo: visibility?.showBusinessInfo ?? true,
      showLineItemPrices: visibility?.showLineItemPrices ?? true,
    },
  };
}
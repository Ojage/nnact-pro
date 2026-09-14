export type DocumentFormat = "email" | "envelope";
export type InvoiceDueTerm = "on_receipt" | "work_start" | "work_completion" | "net_days";
export type EstimateApprovalMode = "single_option" | "multiple_options";
export type DepositMode = "none" | "fixed" | "percent";

import type { CurrencyCode } from "./currency.js";
import { DEFAULT_CURRENCY, isCurrencyCode } from "./currency.js";
import {
  normalizeComebackSettings,
  type ComebackSettings,
} from "./comeback.js";

export interface BusinessHoursSettings {
  timezone: string;
  workDays: string[];
  startTime: string;
  endTime: string;
}

export interface InvoiceVisibilitySettings {
  showBusinessInfo: boolean;
  showCustomerInfo: boolean;
  showJobInfo: boolean;
  showLineItems: boolean;
  showLineItemPrices: boolean;
  showPayments: boolean;
  showBalance: boolean;
}

export interface InvoiceSettings {
  dueTerm: InvoiceDueTerm;
  netDays: number;
  format: DocumentFormat;
  defaultMessage: string;
  paymentInstructions: string;
  reminderDays: number[];
  visibility: InvoiceVisibilitySettings;
}

export interface EstimateVisibilitySettings {
  showBusinessInfo: boolean;
  showCustomerInfo: boolean;
  showJobInfo: boolean;
  showLineItems: boolean;
  showLineItemPrices: boolean;
  showOptionSummary: boolean;
}

export interface EstimateSettings {
  expirationDays: number;
  approvalMode: EstimateApprovalMode;
  signatureRequired: boolean;
  depositMode: DepositMode;
  depositValue: number;
  format: DocumentFormat;
  defaultMessage: string;
  optionLabels: [string, string, string];
  /** Default single-option label used when approvalMode is "single_option". */
  singleOptionLabel: string;
  /**
   * Default payment terms printed on the estimate. Kept as text so
   * organizations use their own wording without code changes.
   */
  paymentTerms: string;
  /** Default workmanship/parts warranty clause. Printed only when configured. */
  warrantyTerms: string;
  /**
   * Default exclusions/assumptions clause. Never implies coverage the
   * estimate does not actually include.
   */
  defaultExclusions: string;
  visibility: EstimateVisibilitySettings;
}

export interface PaymentSettings {
  onlinePaymentsEnabled: boolean;
  allowManualCash: boolean;
  allowManualCheck: boolean;
  allowManualCard: boolean;
  allowPartialPayments: boolean;
  tipsEnabled: boolean;
}

export interface TaxProfile {
  id: string;
  name: string;
  /** Tax rate in basis points (0–10000, i.e. 0%–100%). */
  rateBps: number;
  isDefault: boolean;
}

export type DiscountType = "fixed" | "percent";

export interface SavedDiscount {
  id: string;
  name: string;
  type: DiscountType;
  /** Fixed discounts: cents. Percent discounts: basis points (0–10000). */
  value: number;
}

/**
 * Immutable pricing breakdown captured when a document total is computed.
 * Stored on invoices, estimates, and estimate options so later settings
 * changes never rewrite issued numbers.
 */
export interface PricingSnapshot {
  /** Sum of line totals before adjustments (cents). */
  subtotal: number;
  /** Discount amount applied (cents). */
  discount: number;
  /** Tax amount applied to the discounted subtotal (cents). */
  tax: number;
  /** subtotal - discount + tax (cents). */
  total: number;
  /** Rate that produced the tax (basis points). */
  taxRateBps: number;
  taxProfileId: string | null;
  taxLabel: string;
  discountId: string | null;
  discountLabel: string;
  discountType: DiscountType | null;
}

export interface TaxSettings {
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRateBps: number;
  taxProfiles: TaxProfile[];
  discountsEnabled: boolean;
  defaultDiscountLabel: string;
  discounts: SavedDiscount[];
}

export interface MessageSettings {
  invoiceEmailSubject: string;
  invoiceEmailBody: string;
  estimateEmailSubject: string;
  estimateEmailBody: string;
  reviewRequestBody: string;
  portalLinkSubject: string;
  portalLinkBody: string;
}

export interface NumberingSettings {
  invoicePrefix: string;
  invoiceNextNumber: number;
  estimatePrefix: string;
  estimateNextNumber: number;
  jobPrefix: string;
  jobNextNumber: number;
  expensePrefix: string;
  expenseNextNumber: number;
  billPrefix: string;
  billNextNumber: number;
  advancePrefix: string;
  advanceNextNumber: number;
  reimbursementPrefix: string;
  reimbursementNextNumber: number;
  comebackPrefix: string;
  comebackNextNumber: number;
}

export interface PortalSettings {
  enabled: boolean;
  showSponsorSlot: boolean;
  allowEstimateApproval: boolean;
  allowInvoicePayment: boolean;
  allowServiceHistory: boolean;
}

export interface BusinessSettings {
  /** ISO 4217 currency used for estimates, invoices, payments, and emails. */
  currency: CurrencyCode;
  businessHours: BusinessHoursSettings;
  serviceAreas: string[];
  invoice: InvoiceSettings;
  estimate: EstimateSettings;
  payments: PaymentSettings;
  taxes: TaxSettings;
  messages: MessageSettings;
  numbering: NumberingSettings;
  portal: PortalSettings;
  comeback: ComebackSettings;
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  currency: DEFAULT_CURRENCY,
  businessHours: {
    timezone: "America/New_York",
    workDays: ["mon", "tue", "wed", "thu", "fri"],
    startTime: "08:00",
    endTime: "17:00",
  },
  serviceAreas: [],
  invoice: {
    dueTerm: "net_days",
    netDays: 14,
    format: "email",
    defaultMessage: "Thank you for your business. Please review the invoice and pay the balance by the due date.",
    paymentInstructions: "Pay online if enabled, or contact the office to arrange cash, check, or card payment.",
    reminderDays: [3, 7, 14],
    visibility: {
      showBusinessInfo: true,
      showCustomerInfo: true,
      showJobInfo: true,
      showLineItems: true,
      showLineItemPrices: true,
      showPayments: true,
      showBalance: true,
    },
  },
  estimate: {
    expirationDays: 30,
    approvalMode: "single_option",
    signatureRequired: true,
    depositMode: "none",
    depositValue: 0,
    format: "email",
    defaultMessage: "This estimate is valid pending final service conditions and customer approval.",
    optionLabels: ["Good", "Better", "Best"],
    singleOptionLabel: "Recommended solution",
    paymentTerms: "The balance is payable on completion of the work unless otherwise agreed.",
    warrantyTerms: "Workmanship is guaranteed for 30 days from completion. Parts warranty follows manufacturer or supplier terms.",
    defaultExclusions:
      "Additional faults discovered during the work that are not part of this quotation will be reported and approved before proceeding.",
    visibility: {
      showBusinessInfo: true,
      showCustomerInfo: true,
      showJobInfo: true,
      showLineItems: true,
      showLineItemPrices: true,
      showOptionSummary: true,
    },
  },
  payments: {
    onlinePaymentsEnabled: false,
    allowManualCash: true,
    allowManualCheck: true,
    allowManualCard: true,
    allowPartialPayments: true,
    tipsEnabled: false,
  },
  taxes: {
    taxEnabled: false,
    taxLabel: "Sales tax",
    defaultTaxRateBps: 0,
    taxProfiles: [],
    discountsEnabled: true,
    defaultDiscountLabel: "Discount",
    discounts: [],
  },
  messages: {
    invoiceEmailSubject: "Invoice {{invoiceNumber}} from {{companyName}}",
    invoiceEmailBody: "Hi {{customerName}}, your invoice is ready. Balance due: {{balance}}.",
    estimateEmailSubject: "Estimate from {{companyName}}",
    estimateEmailBody: "Hi {{customerName}}, please review estimate {{estimateNumber}} and approve the option that works best.",
    reviewRequestBody: "Thanks for choosing {{companyName}}. If we earned it, please leave us a review.",
    portalLinkSubject: "Your customer portal link from {{companyName}}",
    portalLinkBody: "Hi {{customerName}},\n\nHere is your secure customer portal link for {{companyName}}:\n\n{{portalLink}}\n\n{{#portalExpiresAt}}This link expires {{portalExpiresAt}}.\n\n{{/portalExpiresAt}}Use it to review your balance, pay online, see receipts, and view your service plan.",
  },
  numbering: {
    invoicePrefix: "INV",
    invoiceNextNumber: 1000,
    estimatePrefix: "EST",
    estimateNextNumber: 1000,
    jobPrefix: "JOB",
    jobNextNumber: 1000,
    expensePrefix: "NNACT/EXP",
    expenseNextNumber: 1000,
    billPrefix: "NNACT/BILL",
    billNextNumber: 1000,
    advancePrefix: "NNACT/ADV",
    advanceNextNumber: 1000,
    reimbursementPrefix: "NNACT/REIMB",
    reimbursementNextNumber: 1000,
    comebackPrefix: "NNACT/RET",
    comebackNextNumber: 1000,
  },
  portal: {
    enabled: true,
    showSponsorSlot: true,
    allowEstimateApproval: true,
    allowInvoicePayment: true,
    allowServiceHistory: true,
  },
  comeback: normalizeComebackSettings(null),
};

export function mergeBusinessSettings(input: unknown): BusinessSettings {
  const value = isRecord(input) ? input : {};
  const invoice = isRecord(value.invoice) ? value.invoice : {};
  const estimate = isRecord(value.estimate) ? value.estimate : {};

  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...value,
    currency: isCurrencyCode(value.currency) ? value.currency : DEFAULT_CURRENCY,
    businessHours: {
      ...DEFAULT_BUSINESS_SETTINGS.businessHours,
      ...(isRecord(value.businessHours) ? value.businessHours : {}),
    },
    serviceAreas: Array.isArray(value.serviceAreas) ? value.serviceAreas.filter((item): item is string => typeof item === "string") : [],
    invoice: {
      ...DEFAULT_BUSINESS_SETTINGS.invoice,
      ...invoice,
      visibility: {
        ...DEFAULT_BUSINESS_SETTINGS.invoice.visibility,
        ...(isRecord(invoice.visibility) ? invoice.visibility : {}),
      },
    },
    estimate: {
      ...DEFAULT_BUSINESS_SETTINGS.estimate,
      ...estimate,
      optionLabels: normalizeOptionLabels(estimate.optionLabels),
      visibility: {
        ...DEFAULT_BUSINESS_SETTINGS.estimate.visibility,
        ...(isRecord(estimate.visibility) ? estimate.visibility : {}),
      },
    },
    payments: {
      ...DEFAULT_BUSINESS_SETTINGS.payments,
      ...(isRecord(value.payments) ? value.payments : {}),
    },
    taxes: {
      ...DEFAULT_BUSINESS_SETTINGS.taxes,
      ...(isRecord(value.taxes) ? value.taxes : {}),
      taxProfiles: normalizeTaxProfiles((isRecord(value.taxes) ? value.taxes : {}).taxProfiles),
      discounts: normalizeDiscounts((isRecord(value.taxes) ? value.taxes : {}).discounts),
    },
    messages: {
      ...DEFAULT_BUSINESS_SETTINGS.messages,
      ...(isRecord(value.messages) ? value.messages : {}),
    },
    numbering: {
      ...DEFAULT_BUSINESS_SETTINGS.numbering,
      ...(isRecord(value.numbering) ? value.numbering : {}),
    },
    portal: {
      ...DEFAULT_BUSINESS_SETTINGS.portal,
      ...(isRecord(value.portal) ? value.portal : {}),
    },
    comeback: normalizeComebackSettings(value.comeback),
  };
}

function normalizeOptionLabels(value: unknown): [string, string, string] {
  if (!Array.isArray(value)) return DEFAULT_BUSINESS_SETTINGS.estimate.optionLabels;
  return [
    typeof value[0] === "string" && value[0].trim() ? value[0] : "Good",
    typeof value[1] === "string" && value[1].trim() ? value[1] : "Better",
    typeof value[2] === "string" && value[2].trim() ? value[2] : "Best",
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTaxProfiles(input: unknown): TaxProfile[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.filter((profile): profile is TaxProfile => {
    if (!isRecord(profile)) return false;
    if (typeof profile.id !== "string" || !profile.id.trim() || seen.has(profile.id)) return false;
    if (typeof profile.name !== "string" || !profile.name.trim()) return false;
    if (typeof profile.rateBps !== "number" || !Number.isInteger(profile.rateBps) || profile.rateBps < 0 || profile.rateBps > 10_000) return false;
    seen.add(profile.id);
    return true;
  });
}

function normalizeDiscounts(input: unknown): SavedDiscount[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.filter((discount): discount is SavedDiscount => {
    if (!isRecord(discount)) return false;
    if (typeof discount.id !== "string" || !discount.id.trim() || seen.has(discount.id)) return false;
    if (typeof discount.name !== "string" || !discount.name.trim()) return false;
    if (discount.type !== "fixed" && discount.type !== "percent") return false;
    if (typeof discount.value !== "number" || !Number.isInteger(discount.value) || discount.value < 0) return false;
    if (discount.type === "percent" && discount.value > 10_000) return false;
    seen.add(discount.id);
    return true;
  });
}

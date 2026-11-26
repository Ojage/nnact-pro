import { z } from "zod";

export const PRICE_OBSERVATION_SOURCES = ["receipt", "manual", "historical"] as const;
export type PriceObservationSource = (typeof PRICE_OBSERVATION_SOURCES)[number];

export const PRICE_OBSERVATION_STATUSES = ["pending", "confirmed"] as const;
export type PriceObservationStatus = (typeof PRICE_OBSERVATION_STATUSES)[number];

export const PRICE_BOOK_RATE_KINDS = ["labor", "transport", "diagnostic"] as const;
export type PriceBookRateKind = (typeof PRICE_BOOK_RATE_KINDS)[number];

export const QUOTE_LINE_KINDS = ["part", "labor", "transport", "diagnostic"] as const;
export type QuoteLineKind = (typeof QUOTE_LINE_KINDS)[number];

export const QUOTE_PROPOSAL_STATUSES = ["draft", "approved", "rejected", "superseded"] as const;
export type QuoteProposalStatus = (typeof QUOTE_PROPOSAL_STATUSES)[number];

/** XAF is stored in integer cents everywhere in NNACT; zero is "no price". */
export const PRICE_BOOK_DEFAULT_FRESHNESS_DAYS = 30;
export const PRICE_BOOK_MIN_CONFIDENCE = 0;
export const PRICE_BOOK_MAX_CONFIDENCE = 100;
/** Historical prices are never treated as fresh, however old the source row is. */
export const HISTORICAL_CONFIDENCE_CAP = 35;

export const priceAliasesSchema = z.object({
  en: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  fr: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
});
export type PriceAliases = z.infer<typeof priceAliasesSchema>;

export interface PriceBookCategoryDTO {
  id: string;
  orgId: string;
  name: string;
  freshnessDays: number;
  active: boolean;
  createdAt: string;
}

export interface PriceBookItemDTO {
  id: string;
  orgId: string;
  categoryId: string;
  canonicalName: string;
  unit: string;
  aliases: PriceAliases;
  catalogItemId: string | null;
  suggested: boolean;
  active: boolean;
  createdAt: string;
}

export interface PriceObservationDTO {
  id: string;
  orgId: string;
  itemId: string;
  amountCents: number;
  shopName: string | null;
  area: string | null;
  source: PriceObservationSource;
  status: PriceObservationStatus;
  observedAt: string;
  jobId: string | null;
  recordedBy: string | null;
  confidence: number;
  receiptMediaRef: string | null;
  createdAt: string;
}

export interface PriceBookRateDTO {
  id: string;
  orgId: string;
  kind: PriceBookRateKind;
  key: string;
  amountCents: number;
  active: boolean;
  createdAt: string;
}

export interface PriceRangeDTO {
  lowCents: number | null;
  highCents: number | null;
  weightedCents: number | null;
  confidence: number;
  basis: "none" | "fresh" | "stale" | "sparse";
  observationCount: number;
}

export interface PricedCandidateDTO {
  itemId: string | null;
  rateId: string | null;
  kind: QuoteLineKind;
  name: string;
  unit: string;
  range: PriceRangeDTO;
  aliases: PriceAliases;
  observationIds: string[];
}

export interface QuoteLineSourceDTO {
  candidateId: string;
  source: "price_book_item" | "rate_table";
  observationIds: string[];
  note: string | null;
}

export interface QuoteProposalLineDTO {
  id: string;
  proposalId: string;
  kind: QuoteLineKind;
  itemId: string | null;
  rateId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceLowCents: number | null;
  unitPriceHighCents: number | null;
  lineLowCents: number | null;
  lineHighCents: number | null;
  finalUnitPriceCents: number | null;
  confidence: number;
  source: QuoteLineSourceDTO;
  needsManualPrice: boolean;
  stale: boolean;
  createdAt: string;
}

export interface QuoteProposalDTO {
  id: string;
  orgId: string;
  jobId: string;
  status: QuoteProposalStatus;
  agentRunId: string | null;
  lowCents: number | null;
  highCents: number | null;
  confidence: number;
  assumptions: string[];
  missingInformation: string[];
  model: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  lines: QuoteProposalLineDTO[];
}

/** Receipt vision output. Prices are copied from the image, never inferred. */
export const receiptLineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(1000).default(1),
  unitPriceCents: z.number().int().nonnegative().max(100_000_000).nullable(),
  unit: z.string().trim().max(40).nullable().optional(),
});

export const receiptExtractionSchema = z.object({
  shopName: z.string().trim().max(160).nullable().default(null),
  area: z.string().trim().max(160).nullable().default(null),
  lines: z.array(receiptLineSchema).max(40).default([]),
  notes: z.string().trim().max(300).nullable().default(null),
});
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

/**
 * Quoting model contract: the model selects candidate ids and quantities only.
 * It never supplies a price, so a hallucinated price has nowhere to enter.
 */
export const quoteLineSelectionSchema = z.object({
  candidateId: z.string().uuid(),
  kind: z.enum(QUOTE_LINE_KINDS),
  quantity: z.number().int().positive().max(1000),
  reason: z.string().trim().max(300).default(""),
  needsManualPrice: z.boolean().default(false),
});

export const quoteProposalDraftSchema = z.object({
  lines: z.array(quoteLineSelectionSchema).min(1).max(30),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  missingInformation: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  confidence: z.number().min(0).max(1),
  diagnosticVisitRecommended: z.boolean().default(false),
});
export type QuoteProposalDraft = z.infer<typeof quoteProposalDraftSchema>;

export interface HistoricalImportRow {
  sourceTable: "expenses" | "supplier_bill_lines" | "line_items" | "estimate_option_line_items" | "invoice_line_items" | "part_procurement_records";
  sourceId: string;
  description: string;
  amountCents: number;
  observedAt: string;
  shopName: string | null;
  matchedItemId: string | null;
  suggestedName: string;
}

export interface HistoricalImportReport {
  dryRun: boolean;
  scanned: number;
  mapped: number;
  unmapped: number;
  unmappedShare: number;
  coverageShare: number;
  zeroOrMissingPrice: number;
  samples: HistoricalImportRow[];
  inserted: number;
}

import { z } from "zod";

export const sourcingSuggestionLineWriteSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive().max(1000),
  unit: z.string().trim().min(1).max(40).default("piece"),
  supplierContactId: z.string().uuid().optional(),
});

export const sourcingSuggestionWriteSchema = z.object({
  jobId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  fingerprint: z.string().trim().min(1).max(200),
  lines: z.array(sourcingSuggestionLineWriteSchema).min(1).max(25),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(1200),
  assumptions: z.array(z.string().trim().min(1).max(200)).max(10),
  missingInformation: z.array(z.string().trim().min(1).max(200)).max(10),
});

export const sourcingPriceRangeSchema = z.object({
  lowCents: z.number().int().nullable(),
  highCents: z.number().int().nullable(),
  weightedCents: z.number().int().nullable(),
  confidence: z.number().int(),
  basis: z.string(),
  observationCount: z.number().int(),
});

export const sourcingCandidateSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string(),
  unit: z.string(),
  range: sourcingPriceRangeSchema,
  stale: z.boolean(),
});

export const sourcingSupplierMessageWriteSchema = z.object({
  suggestionId: z.string().uuid(),
  supplierContactId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).max(25),
  runId: z.string().uuid().optional(),
});

export const supplierContactWriteSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().optional(),
  area: z.string().trim().max(120).optional(),
});

export const sourcingSuggestionDTOSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  state: z.string(),
  shadow: z.boolean(),
  fingerprint: z.string(),
  lowCents: z.number().int().nullable(),
  highCents: z.number().int().nullable(),
  confidence: z.number(),
  rationale: z.string(),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
  createdAt: z.string(),
});

export type SourcingSuggestionWrite = z.infer<typeof sourcingSuggestionWriteSchema>;
export type SourcingSuggestionDTO = z.infer<typeof sourcingSuggestionDTOSchema>;
export type SourcingCandidate = z.infer<typeof sourcingCandidateSchema>;

export const sourcingOutcomeRequestSchema = z.object({
  state: z.enum(["accepted", "changed", "ignored"]),
  reason: z.string().trim().max(500).optional(),
});

export const sourcingRejectRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

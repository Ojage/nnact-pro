import { z } from "zod";

export const TRIAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const triagePrioritySchema = z.enum(TRIAGE_PRIORITIES);
export type TriagePriority = z.infer<typeof triagePrioritySchema>;

export const triageLikelyFaultSchema = z.object({
  name: z.string().trim().min(1).max(160),
  likelihood: z.number().min(0).max(1),
});

export const triageSuggestionWriteSchema = z.object({
  jobId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  fingerprint: z.string().trim().min(1).max(200),
  symptoms: z.array(z.string().trim().min(1).max(200)).max(10),
  likelyFaults: z.array(triageLikelyFaultSchema).max(6),
  priority: triagePrioritySchema,
  rationale: z.string().trim().min(1).max(1200),
  missingInformation: z.array(z.string().trim().min(1).max(200)).max(10),
  confidence: z.number().min(0).max(1),
});

export const triageSuggestionDTOSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  state: z.string(),
  shadow: z.boolean(),
  fingerprint: z.string(),
  symptoms: z.array(z.string()),
  likelyFaults: z.array(triageLikelyFaultSchema),
  priority: triagePrioritySchema,
  rationale: z.string(),
  missingInformation: z.array(z.string()),
  confidence: z.number(),
  createdAt: z.string(),
});

export type TriageSuggestionWrite = z.infer<typeof triageSuggestionWriteSchema>;
export type TriageSuggestionDTO = z.infer<typeof triageSuggestionDTOSchema>;

export const triageOutcomeRequestSchema = z.object({
  state: z.enum(["accepted", "changed", "ignored"]),
  reason: z.string().trim().max(500).optional(),
});

export const triageRejectRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

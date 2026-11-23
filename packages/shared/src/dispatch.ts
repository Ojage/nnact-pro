import { z } from "zod";

export const DISPATCH_SUGGESTION_STATES = ["shadow", "shown", "accepted", "changed", "ignored", "rejected"] as const;
export type DispatchSuggestionState = (typeof DISPATCH_SUGGESTION_STATES)[number];

export const DISPATCH_SUGGESTION_OUTCOMES = ["accepted", "changed", "ignored"] as const;
export type DispatchSuggestionOutcome = (typeof DISPATCH_SUGGESTION_OUTCOMES)[number];

export const dispatchScoreFactorSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  points: z.number().min(-100).max(100),
  detail: z.string().min(1).max(240),
});

export const dispatchCandidateSchema = z.object({
  technicianId: z.string().uuid(),
  name: z.string().min(1).max(160),
  rank: z.number().int().min(1).max(3),
  score: z.number().min(0),
  confidence: z.number().min(0).max(1),
  factors: z.array(dispatchScoreFactorSchema).max(8),
  reasons: z.array(z.string().min(1).max(240)).max(2),
});

export const dispatchRankedCandidateSchema = dispatchCandidateSchema.extend({
  reasonSource: z.enum(["model", "fallback"]),
});

export type DispatchScoreFactor = z.infer<typeof dispatchScoreFactorSchema>;
export type DispatchCandidate = z.infer<typeof dispatchCandidateSchema>;
export type DispatchRankedCandidate = z.infer<typeof dispatchRankedCandidateSchema>;

export const dispatchEligibleJobSchema = z.object({
  jobId: z.string().uuid(),
  orgId: z.string().uuid(),
  fingerprint: z.string().min(8).max(128),
  title: z.string().max(200).nullable(),
  serviceCategory: z.string().max(120).nullable(),
  serviceAddress: z.string().max(500).nullable(),
  scheduledAt: z.string().datetime().nullable(),
  town: z.string().max(120).nullable(),
  neighborhood: z.string().max(120).nullable(),
  landmark: z.string().max(500).nullable(),
  zone: z.string().max(120).nullable(),
  landmarkDirections: z.string().max(500).nullable(),
  customerId: z.string().uuid().nullable(),
  skillHints: z.array(z.string().min(1).max(120)).max(10),
});

export const dispatchRankingTechnicianSchema = z.object({
  technicianId: z.string().uuid(),
  name: z.string().min(1).max(160),
  homeArea: z.string().max(160).nullable(),
  maxDailyVisits: z.number().int().min(1).max(50),
  skills: z.array(z.string().min(1).max(120)).max(50),
  todayVisits: z.number().int().min(0).max(100),
  hasConflict: z.boolean(),
  completedSameCategory: z.number().int().min(0).max(1000),
  priorCustomerVisits: z.number().int().min(0).max(1000),
  outcomeQualityScore: z.number().min(0).max(1).nullable(),
  outcomeFailureCount: z.number().int().min(0).max(1000),
});

export const dispatchRankingInputSchema = z.object({
  job: dispatchEligibleJobSchema,
  technicians: z.array(dispatchRankingTechnicianSchema).max(100),
});

export const dispatchReasonsRequestSchema = z.object({
  job: dispatchEligibleJobSchema,
  candidates: z.array(dispatchCandidateSchema).max(3),
});

export const dispatchReasonsOutputSchema = z.object({
  reasons: z.array(
    z.object({
      technicianId: z.string().uuid(),
      reason: z.string().trim().min(1).max(240),
    }),
  ).max(3),
});

export const dispatchSuggestionWriteSchema = z
  .object({
    jobId: z.string().uuid(),
    runId: z.string().uuid(),
    fingerprint: z.string().min(8).max(128),
    candidates: z.array(dispatchRankedCandidateSchema).min(1).max(3),
    causes: z.array(z.string().min(1).max(240)).max(5),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((value, ctx) => {
    value.candidates
      .map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => a.candidate.rank - b.candidate.rank)
      .forEach(({ candidate, index }, position) => {
        if (candidate.rank !== position + 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["candidates", index, "rank"],
            message: "Ranks must be sequential from 1",
          });
        }
      });
  });

export const dispatchSuggestionDTOSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  state: z.enum(DISPATCH_SUGGESTION_STATES),
  shadow: z.boolean(),
  fingerprint: z.string(),
  candidates: z.array(dispatchRankedCandidateSchema),
  causes: z.array(z.string()),
  confidence: z.number(),
  actualTechnicianId: z.string().uuid().nullable(),
  outcomeReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const dispatchOutcomeRequestSchema = z.object({
  state: z.enum(DISPATCH_SUGGESTION_OUTCOMES),
  actualTechnicianId: z.string().uuid().nullable(),
  reason: z.string().trim().max(500).nullable(),
});

export const dispatchRejectRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const dispatchComparisonRequestSchema = z.object({
  suggestionId: z.string().uuid(),
  actualTechnicianId: z.string().uuid(),
});

export type DispatchEligibleJob = z.infer<typeof dispatchEligibleJobSchema>;
export type DispatchRankingTechnician = z.infer<typeof dispatchRankingTechnicianSchema>;
export type DispatchRankingInput = z.infer<typeof dispatchRankingInputSchema>;
export type DispatchReasonsRequest = z.infer<typeof dispatchReasonsRequestSchema>;
export type DispatchReasonsOutput = z.infer<typeof dispatchReasonsOutputSchema>;
export type DispatchSuggestionWrite = z.infer<typeof dispatchSuggestionWriteSchema>;
export type DispatchSuggestionDTO = z.infer<typeof dispatchSuggestionDTOSchema>;
export type DispatchOutcomeRequest = z.infer<typeof dispatchOutcomeRequestSchema>;
export type DispatchRejectRequest = z.infer<typeof dispatchRejectRequestSchema>;

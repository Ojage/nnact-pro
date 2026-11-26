import { z } from "zod";

export const copilotSuggestionWriteSchema = z.object({
  jobId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  fingerprint: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1200),
  recommendedActions: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  draftReply: z.string().trim().min(1).max(2000).nullable().optional(),
  risks: z.array(z.string().trim().min(1).max(240)).max(10),
  missingInformation: z.array(z.string().trim().min(1).max(240)).max(10),
  confidence: z.number().min(0).max(1),
});

export const copilotSuggestionDTOSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  state: z.string(),
  shadow: z.boolean(),
  fingerprint: z.string(),
  summary: z.string(),
  recommendedActions: z.array(z.string()),
  draftReply: z.string().nullable(),
  risks: z.array(z.string()),
  missingInformation: z.array(z.string()),
  confidence: z.number(),
  createdAt: z.string(),
});

export const copilotOutcomeRequestSchema = z.object({
  state: z.enum(["accepted", "changed", "ignored"]),
  reason: z.string().trim().max(500).optional(),
});

export const copilotRejectRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export type CopilotSuggestionWrite = z.infer<typeof copilotSuggestionWriteSchema>;
export type CopilotSuggestionDTO = z.infer<typeof copilotSuggestionDTOSchema>;

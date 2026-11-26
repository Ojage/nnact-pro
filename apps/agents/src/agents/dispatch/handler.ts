// Dispatch Agent: suggests the top three technicians for an open job, with
// reasons. Ranking is the server's deterministic code; the model may only
// normalize the landmark directions and word the reasons for candidates the
// server already chose. It never assigns, books or notifies anyone.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, dispatchSuggestions, jobs } from "@nnact/db";
import { dispatchReasonsOutputSchema, type DispatchCandidate, type DispatchEligibleJob, type DispatchReasonsOutput } from "@nnact/shared";
import { applyDispatchReasons } from "../../../../api/src/dispatch/ranking.js";
import { registry, textProviderOrder } from "../../lib/ai.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";

export const PROMPT_VERSION = "dispatch-reasons-v1";

const SYSTEM = [
  "You write short reasons for technician suggestions at a home-appliance repair company in Cameroon.",
  "The candidates are already chosen and ranked by code. Do not add, remove or reorder technicians.",
  "For each technicianId given, write one plain sentence (max 200 characters) based only on its factors.",
  "Never promise an arrival time, a price or an assignment.",
  "Also give `area`: the job's area as a short place name if the landmark directions make it clear, else null.",
  'Answer JSON: {"area": string|null, "reasons": [{"technicianId": string, "reason": string}]}',
].join("\n");

interface RankResponse {
  job: DispatchEligibleJob;
  fingerprint: string;
  candidates: DispatchCandidate[];
  causes: string[];
}

function reasonsPrompt(ranked: RankResponse): string {
  return JSON.stringify({
    job: {
      title: ranked.job.title,
      serviceCategory: ranked.job.serviceCategory,
      town: ranked.job.town,
      neighborhood: ranked.job.neighborhood,
      zone: ranked.job.zone,
      landmarkDirections: ranked.job.landmarkDirections,
    },
    candidates: ranked.candidates.map((candidate) => ({
      technicianId: candidate.technicianId,
      name: candidate.name,
      rank: candidate.rank,
      factors: candidate.factors.map((factor) => ({ label: factor.label, detail: factor.detail })),
    })),
  });
}

export async function processDispatchJob(api: AgentPlatformApi, office: AgentOffice, orgId: string, jobId: string, leaseId?: string): Promise<void> {
  const run = await office.beginRun(
    { orgId, jobId, task: "agent.dispatch", input: { jobId }, promptVersion: PROMPT_VERSION },
    { label: "Ranking technicians", steps: 3, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);
  try {
    const ranked = await run.step(
      "rank",
      "Rank technicians (deterministic)",
      () => api.agentFetch<RankResponse>(`/api/v1/agent/dispatch/jobs/${jobId}/rank`, orgId, {}),
      { summarize: (result) => ({ fields: { candidates: result.candidates.length, excluded: result.causes.length } }) },
    );
    if (ranked.candidates.length === 0) {
      await finish({ orgId, state: "skipped", jobId, outcome: "no_candidates", output: { causes: ranked.causes }, promptVersion: PROMPT_VERSION });
      await run.end();
      return;
    }

    // Reasons are a nicety: if the model fails, the fixed fallback reasons stand.
    let reasons: DispatchReasonsOutput | null = null;
    let usage: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number } = {};
    await run
      .step(
        "reasons",
        "Write plain-language reasons",
        async () => {
          const generated = await registry.generateTextWithFallback(
            orgId,
            { system: SYSTEM, prompt: reasonsPrompt(ranked), structured: true, temperature: 0, maxTokens: 600, task: "agent.dispatch", runId: run.id },
            await textProviderOrder(orgId),
          );
          const parsed = dispatchReasonsOutputSchema.safeParse(generated.result.structuredData);
          if (!parsed.success) throw new Error("schema_invalid: reasons did not match the schema");
          reasons = parsed.data;
          usage = {
            provider: generated.result.provider,
            model: generated.result.model,
            inputTokens: generated.result.inputTokens,
            outputTokens: generated.result.outputTokens,
          };
          return parsed.data;
        },
        { summarize: (result) => ({ fields: { reasons: result.reasons.length, area: result.area ? "set" : "none" } }) },
      )
      .catch(async () => {
        await run.log("warn", "model reasons unavailable; using fixed reasons");
      });

    const candidates = applyDispatchReasons(ranked.candidates, reasons);
    const suggestion = await run.step(
      "suggest",
      "Save suggestion",
      () =>
        api.agentFetch<{ id: string; state: string }>("/api/v1/agent/dispatch/suggestions", orgId, {
          jobId,
          runId: run.id,
          fingerprint: ranked.fingerprint,
          candidates,
          causes: ranked.causes,
          confidence: candidates[0]?.confidence ?? 0,
        }),
      { summarize: (result) => ({ fields: { state: result.state } }) },
    );
    await finish({
      orgId,
      state: "completed",
      jobId,
      output: { suggestionId: suggestion.id, state: suggestion.state, top: candidates.map((candidate) => candidate.technicianId) },
      ...usage,
      promptVersion: PROMPT_VERSION,
      outcome: "success",
    });
    await run.end();
  } catch (error) {
    await finish({ orgId, state: "failed", jobId, error: (error as Error).message.slice(0, 1000), promptVersion: PROMPT_VERSION, outcome: "failure" }).catch(() => undefined);
    await run.end(true);
    throw error;
  }
}

/**
 * Record what dispatchers actually did with open suggestions: once a job has
 * a technician, the server marks the suggestion accepted or changed.
 */
export async function compareAssignments(api: AgentPlatformApi, limit = 50): Promise<number> {
  const open = await db
    .select({ id: dispatchSuggestions.id, orgId: dispatchSuggestions.orgId, assignedTo: jobs.assignedTo })
    .from(dispatchSuggestions)
    .innerJoin(jobs, eq(jobs.id, dispatchSuggestions.jobId))
    .where(and(eq(dispatchSuggestions.current, 1), inArray(dispatchSuggestions.state, ["shadow", "shown"]), isNotNull(jobs.assignedTo)))
    .limit(limit);
  let compared = 0;
  for (const row of open) {
    try {
      await api.agentFetch(`/api/v1/agent/dispatch/suggestions/${row.id}/compare`, row.orgId, { actualTechnicianId: row.assignedTo });
      compared += 1;
    } catch {
      // The next tick tries again.
    }
  }
  return compared;
}

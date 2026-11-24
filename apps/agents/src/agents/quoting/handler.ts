import { eq } from "drizzle-orm";
import { db, jobs } from "@nnact/db";
import { quoteProposalDraftSchema, type PricedCandidateDTO, type QuoteProposalDraft } from "@nnact/shared";
import { quotePrompt, rejectModelPrices, serviceAreaFromAddress } from "../../lib/helpers.js";
import { registry, textProviderOrder } from "../../lib/ai.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";
import { PROMPT_VERSION, QUOTE_SYSTEM } from "./prompt.js";

/**
 * Draft a quote proposal for a job. The model only picks candidate ids and
 * quantities; every price comes from the Price Book on the server, and a line
 * with no known price is marked "needs manual price".
 */
export async function processQuoteJob(api: AgentPlatformApi, office: AgentOffice, jobId: string, leaseId?: string): Promise<void> {
  const [job] = await db
    .select({ id: jobs.id, orgId: jobs.orgId, title: jobs.title, description: jobs.description, serviceAddress: jobs.serviceAddress })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) return;
  const serviceArea = serviceAreaFromAddress(job.serviceAddress);

  const run = await office.beginRun(
    { orgId: job.orgId, jobId: job.id, task: "agent.quote", input: { jobId: job.id, serviceArea }, promptVersion: PROMPT_VERSION },
    { label: "Drafting a quote proposal", steps: 4, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    const candidates = await run.step(
      "candidates",
      "Load priced Price Book candidates",
      () => api.agentFetch<PricedCandidateDTO[]>("/api/v1/agent/quotes/candidates", job.orgId),
      { summarize: (list) => ({ fields: { candidates: list.length } }) },
    );
    if (!candidates.length) {
      await finish({ orgId: job.orgId, state: "skipped", error: "no priced candidates available", jobId: job.id, promptVersion: PROMPT_VERSION, outcome: "skipped" });
      await run.end();
      return;
    }

    const generated = await run.step(
      "select",
      "Select lines with the model",
      async () =>
        registry.generateTextWithFallback(
          job.orgId,
          {
            system: QUOTE_SYSTEM,
            prompt: quotePrompt({ job: { title: job.title, description: job.description, serviceArea }, candidates }),
            structured: true,
            temperature: 0,
            maxTokens: 1600,
            task: "agent.quote",
            runId: run.id,
          },
          await textProviderOrder(job.orgId),
        ),
      { summarize: (result) => ({ fields: { provider: result.result.provider, model: result.result.model } }) },
    );

    const draft = await run.step(
      "validate",
      "Validate the draft",
      async (): Promise<QuoteProposalDraft> => {
        rejectModelPrices(generated.result.structuredData);
        const parsed = quoteProposalDraftSchema.safeParse(generated.result.structuredData);
        if (!parsed.success) throw new Error(`invalid quote draft: ${parsed.error.message.slice(0, 300)}`);
        const known = new Set(candidates.map((candidate) => candidate.itemId ?? candidate.rateId));
        const next: QuoteProposalDraft = { ...parsed.data, lines: parsed.data.lines.filter((line) => known.has(line.candidateId)) };
        if (next.lines.length !== parsed.data.lines.length) {
          await run.log("warn", "dropped lines naming unknown candidates", { dropped: parsed.data.lines.length - next.lines.length });
        }
        if (next.diagnosticVisitRecommended && !next.lines.some((line) => line.kind === "diagnostic")) {
          const diagnostic = candidates.find((candidate) => candidate.kind === "diagnostic");
          if (diagnostic) {
            next.lines.push({
              candidateId: diagnostic.itemId ?? diagnostic.rateId ?? "",
              kind: "diagnostic",
              quantity: 1,
              reason: "Diagnostic visit recommended by the agent.",
              needsManualPrice: diagnostic.range.lowCents === null,
            });
          }
        }
        return next;
      },
      { summarize: (result) => ({ fields: { lines: result.lines.length, manual: result.lines.filter((line) => line.needsManualPrice).length } }) },
    );

    const proposal = await run.step("propose", "Save proposal for approval", () =>
      api.agentFetch<{ id: string }>("/api/v1/agent/quotes/proposals", job.orgId, {
        orgId: job.orgId,
        jobId: job.id,
        runId: run.id,
        model: generated.result.model,
        draft,
      }),
    );
    await finish({
      orgId: job.orgId,
      state: "completed",
      output: { proposalId: proposal.id, draft },
      provider: generated.result.provider,
      model: generated.result.model,
      inputTokens: generated.result.inputTokens,
      outputTokens: generated.result.outputTokens,
      jobId: job.id,
      promptVersion: PROMPT_VERSION,
      outcome: "success",
    });
    await run.end();
  } catch (error) {
    await finish({ orgId: job.orgId, state: "failed", error: (error as Error).message.slice(0, 1000), jobId: job.id, promptVersion: PROMPT_VERSION, outcome: "failure" }).catch(
      () => undefined,
    );
    await run.log("error", "quote run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

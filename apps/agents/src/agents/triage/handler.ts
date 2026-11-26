import { and, eq, inArray, sql } from "drizzle-orm";
import { db, agentLeases, jobs, triageSuggestions } from "@nnact/db";
import { AGENT_ID, triageSuggestionWriteSchema } from "@nnact/shared";
import { registry, textProviderOrder } from "../../lib/ai.js";
import { registerWorkSource, type WorkSource } from "../../platform/work-source.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";

const PROMPT_VERSION = "triage-v1";
const SYSTEM = [
  "You triage service jobs for dispatcher review.",
  "Return symptoms, likely faults, priority, rationale, missing information and confidence.",
  "Never assign work, message a customer, change a job, confirm a price or promise an arrival time.",
  "Use only facts present in the job; list uncertainty under missingInformation.",
].join(" ");

interface TriageContext {
  job: {
    id: string;
    title: string | null;
    description: string | null;
    status: string;
    serviceCategory: string | null;
    serviceAddress: string | null;
    town: string | null;
    neighborhood: string | null;
  };
  fingerprint: string;
}

export async function processTriageJob(api: AgentPlatformApi, office: AgentOffice, jobId: string, leaseId?: string): Promise<void> {
  const [job] = await db.select({ id: jobs.id, orgId: jobs.orgId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;
  const run = await office.beginRun(
    { orgId: job.orgId, jobId: job.id, task: "agent.triage", input: { jobId: job.id }, promptVersion: PROMPT_VERSION },
    { label: "Triaging a service job", steps: 3, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    const context = await run.step("context", "Load job context", () =>
      api.agentFetch<TriageContext>(`/api/v1/agent/triage/jobs/${jobId}/context`, job.orgId, {}),
    );
    const generated = await run.step(
      "analyze",
      "Assess symptoms and priority",
      async () =>
        registry.generateTextWithFallback(
          job.orgId,
          {
            system: SYSTEM,
            prompt: JSON.stringify(context.job),
            structured: true,
            temperature: 0,
            maxTokens: 1400,
            task: "agent.triage",
            runId: run.id,
          },
          await textProviderOrder(job.orgId),
        ),
      { summarize: (result) => ({ fields: { provider: result.result.provider, model: result.result.model } }) },
    );
    const draft = await run.step("suggest", "Save suggestion for dispatcher review", async () => {
      const parsed = triageSuggestionWriteSchema.safeParse({
        ...(generated.result.structuredData as Record<string, unknown>),
        jobId: job.id,
        runId: run.id,
        fingerprint: context.fingerprint,
      });
      if (!parsed.success) throw new Error(`invalid triage suggestion: ${parsed.error.message.slice(0, 300)}`);
      return api.agentFetch<{ id: string }>("/api/v1/agent/triage/suggestions", job.orgId, parsed.data);
    });
    await finish({
      orgId: job.orgId,
      state: "completed",
      output: { suggestionId: draft.id, priority: generated.result.structuredData?.priority ?? null },
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
    await run.log("error", "triage run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

export const triageWork: WorkSource = async (limit, now) => {
  const rows = await db
    .select({ id: jobs.id, orgId: jobs.orgId, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(
      and(
        sql`${jobs.status} in ('lead', 'scheduled', 'in_progress')`,
        sql`not exists (select 1 from ${triageSuggestions} s where s.job_id = ${jobs.id} and s.current = 1)`,
      ),
    )
    .orderBy(sql`${jobs.updatedAt} desc`)
    .limit(limit);
  const items = rows.map((row) => ({
    orgId: row.orgId,
    leaseKey: `${row.id}:${row.updatedAt.getTime()}`,
    task: "agent.triage",
    payload: { jobId: row.id },
  }));
  if (!items.length) return items;
  const leased = await db
    .select({ key: agentLeases.leaseKey })
    .from(agentLeases)
    .where(and(eq(agentLeases.agentId, AGENT_ID.triage), inArray(agentLeases.leaseKey, items.map((item) => item.leaseKey))));
  const seen = new Set(leased.map((row) => row.key));
  return items.filter((item) => !seen.has(item.leaseKey));
};

registerWorkSource(AGENT_ID.triage, triageWork);

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, agentLeases, jobs, quoteProposals, sourcingSuggestions } from "@nnact/db";
import { AGENT_ID, sourcingSuggestionWriteSchema, type SourcingCandidate } from "@nnact/shared";
import { registry, textProviderOrder } from "../../lib/ai.js";
import { registerWorkSource, type WorkSource } from "../../platform/work-source.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";

const PROMPT_VERSION = "sourcing-v1";
const SYSTEM = [
  "You prepare sourcing suggestions for dispatcher review.",
  "Choose only candidate item ids supplied in the context; never invent prices, suppliers or purchase orders.",
  "Do not message customers, place orders, confirm prices or change any job record.",
].join(" ");

interface SourcingContext {
  job: { id: string; title: string | null; description: string | null; status: string };
  fingerprint: string;
  candidates: SourcingCandidate[];
  suppliers: Array<{ id: string; name: string; area: string | null }>;
}

export async function processSourcingJob(api: AgentPlatformApi, office: AgentOffice, jobId: string, leaseId?: string): Promise<void> {
  const [job] = await db.select({ id: jobs.id, orgId: jobs.orgId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;
  const run = await office.beginRun(
    { orgId: job.orgId, jobId: job.id, task: "agent.sourcing", input: { jobId: job.id }, promptVersion: PROMPT_VERSION },
    { label: "Preparing sourcing options", steps: 4, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    const context = await run.step("context", "Load parts and supplier context", () =>
      api.agentFetch<SourcingContext>(`/api/v1/agent/sourcing/jobs/${jobId}/context`, job.orgId, {}),
    );
    if (!context.candidates.length) {
      await finish({ orgId: job.orgId, state: "skipped", error: "no Price Book candidates available", jobId: job.id, promptVersion: PROMPT_VERSION, outcome: "skipped" });
      await run.end();
      return;
    }
    const generated = await run.step(
      "select",
      "Select parts with the model",
      async () =>
        registry.generateTextWithFallback(
          job.orgId,
          {
            system: SYSTEM,
            prompt: JSON.stringify(context),
            structured: true,
            temperature: 0,
            maxTokens: 1800,
            task: "agent.sourcing",
            runId: run.id,
          },
          await textProviderOrder(job.orgId),
        ),
      { summarize: (result) => ({ fields: { provider: result.result.provider, model: result.result.model } }) },
    );
    const suggestion = await run.step("suggest", "Save sourcing suggestion for review", async () => {
      const parsed = sourcingSuggestionWriteSchema.safeParse({
        ...(generated.result.structuredData as Record<string, unknown>),
        jobId: job.id,
        runId: run.id,
        fingerprint: context.fingerprint,
      });
      if (!parsed.success) throw new Error(`invalid sourcing suggestion: ${parsed.error.message.slice(0, 300)}`);
      return api.agentFetch<{ id: string }>("/api/v1/agent/sourcing/suggestions", job.orgId, parsed.data);
    });

    const supplierMessageCount = await run.step("suppliers", "Ask known suppliers about availability", async () => {
      const suppliers = new Map(context.suppliers.map((supplier) => [supplier.id, supplier]));
      const bySupplier = new Map<string, string[]>();
      const draftLines = (generated.result.structuredData as { lines?: Array<{ itemId?: string; supplierContactId?: string }> }).lines ?? [];
      for (const line of draftLines) {
        if (!line.supplierContactId || !suppliers.has(line.supplierContactId)) continue;
        const ids = bySupplier.get(line.supplierContactId) ?? [];
        ids.push(line.itemId ?? "");
        bySupplier.set(line.supplierContactId, ids);
      }
      let sent = 0;
      for (const [supplierContactId] of bySupplier) {
        const result = await api.agentFetch<{ created: boolean }>("/api/v1/agent/sourcing/supplier-messages", job.orgId, {
          suggestionId: suggestion.id,
          supplierContactId,
          lineIds: [],
          runId: run.id,
        });
        if (result.created) sent += 1;
      }
      return sent;
    });

    await finish({
      orgId: job.orgId,
      state: "completed",
      output: { suggestionId: suggestion.id, supplierMessages: supplierMessageCount },
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
    await run.log("error", "sourcing run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

export const sourcingWork: WorkSource = async (limit, now) => {
  const rows = await db
    .select({ id: jobs.id, orgId: jobs.orgId, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(
      and(
        sql`exists (select 1 from ${quoteProposals} p where p.job_id = ${jobs.id})`,
        sql`not exists (select 1 from ${sourcingSuggestions} s where s.job_id = ${jobs.id} and s.current = 1)`,
      ),
    )
    .orderBy(sql`${jobs.updatedAt} desc`)
    .limit(limit);
  const items = rows.map((row) => ({
    orgId: row.orgId,
    leaseKey: `${row.id}:${row.updatedAt.getTime()}`,
    task: "agent.sourcing",
    payload: { jobId: row.id },
  }));
  if (!items.length) return items;
  const leased = await db
    .select({ key: agentLeases.leaseKey })
    .from(agentLeases)
    .where(and(eq(agentLeases.agentId, AGENT_ID.sourcing), inArray(agentLeases.leaseKey, items.map((item) => item.leaseKey))));
  const seen = new Set(leased.map((row) => row.key));
  return items.filter((item) => !seen.has(item.leaseKey));
};

registerWorkSource(AGENT_ID.sourcing, sourcingWork);

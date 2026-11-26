import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { agentLeases, conversations, copilotSuggestions, db, jobs } from "@nnact/db";
import { AGENT_ID, copilotSuggestionWriteSchema } from "@nnact/shared";
import { registry, textProviderOrder } from "../../lib/ai.js";
import { registerWorkSource, type WorkSource } from "../../platform/work-source.js";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";

const PROMPT_VERSION = "copilot-v1";
const SYSTEM = [
  "You are Copilot for NNACT field-service staff.",
  "Read the job and recent customer thread, then prepare guidance for staff review only.",
  "Never send messages, assign jobs, confirm prices, change records, or claim an action was taken.",
  "Return a short summary, concrete recommendedActions, an optional draftReply that is a draft only, risks, missingInformation and confidence.",
  "Use only facts present in the context and list uncertainty under missingInformation.",
].join(" ");

interface CopilotContext {
  job: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    serviceCategory: string | null;
    serviceAddress: string | null;
    town: string | null;
    neighborhood: string | null;
  };
  conversation: { id: string; state: string; displayName: string | null; language: string } | null;
  messages: Array<{ id: string; direction: string; text: string | null; transcript: string | null; createdAt: string }>;
  fingerprint: string;
}

function fingerprintFor(updatedAt: Date, lastMessageAt: Date | null | undefined): string {
  return `${updatedAt.toISOString()}|${lastMessageAt ? lastMessageAt.toISOString() : ""}`;
}

export async function processCopilotJob(
  api: AgentPlatformApi,
  office: AgentOffice,
  jobId: string,
  leaseId?: string,
  expectedFingerprint?: string,
): Promise<void> {
  const [job] = await db.select({ id: jobs.id, orgId: jobs.orgId }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return;
  const run = await office.beginRun(
    {
      orgId: job.orgId,
      jobId: job.id,
      task: "agent.copilot_suggestion",
      input: { jobId: job.id },
      promptVersion: PROMPT_VERSION,
    },
    { label: "Preparing Copilot guidance", steps: 3, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);

  try {
    const context = await run.step("context", "Load job and customer thread", () =>
      api.agentFetch<CopilotContext>(`/api/v1/agent/copilot/jobs/${jobId}/context`, job.orgId, {}),
    );
    if (expectedFingerprint && context.fingerprint !== expectedFingerprint) {
      await finish({
        orgId: job.orgId,
        state: "skipped",
        error: "job changed since copilot work was queued",
        jobId: job.id,
        promptVersion: PROMPT_VERSION,
        outcome: "skipped",
      });
      await run.end();
      return;
    }
    const generated = await run.step(
      "guide",
      "Draft staff guidance",
      async () =>
        registry.generateTextWithFallback(
          job.orgId,
          {
            system: SYSTEM,
            prompt: JSON.stringify(context),
            structured: true,
            temperature: 0,
            maxTokens: 1800,
            task: "agent.copilot_suggestion",
            runId: run.id,
          },
          await textProviderOrder(job.orgId),
        ),
      { summarize: (result) => ({ fields: { provider: result.result.provider, model: result.result.model } }) },
    );
    const suggestion = await run.step("save", "Save suggestion for staff review", async () => {
      const parsed = copilotSuggestionWriteSchema.safeParse({
        ...(generated.result.structuredData as Record<string, unknown>),
        jobId: job.id,
        runId: run.id,
        fingerprint: context.fingerprint,
      });
      if (!parsed.success) throw new Error(`invalid copilot suggestion: ${parsed.error.message.slice(0, 300)}`);
      return api.agentFetch<{ id: string }>("/api/v1/agent/copilot/suggestions", job.orgId, parsed.data);
    });
    await finish({
      orgId: job.orgId,
      state: "completed",
      output: { suggestionId: suggestion.id, draftOnly: true },
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
    await finish({
      orgId: job.orgId,
      state: "failed",
      error: (error as Error).message.slice(0, 1000),
      jobId: job.id,
      promptVersion: PROMPT_VERSION,
      outcome: "failure",
    }).catch(() => undefined);
    await run.log("error", "copilot run failed", { kind: (error as Error).name });
    await run.end(true);
    throw error;
  }
}

export const copilotWork: WorkSource = async (limit, now) => {
  const configured = Number(process.env.COPILOT_BACKFILL_DAYS ?? 7);
  const days = Number.isFinite(configured) && configured > 0 ? configured : 7;
  const rows = await db
    .select({ id: jobs.id, orgId: jobs.orgId, updatedAt: jobs.updatedAt, conversationId: jobs.agentConversationId })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["lead", "scheduled", "in_progress"]),
        eq(jobs.agentDraft, false),
        gte(jobs.createdAt, new Date(now.getTime() - days * 86_400_000)),
      ),
    )
    .orderBy(desc(jobs.updatedAt))
    .limit(limit);
  if (!rows.length) return [];
  const conversationIds = rows.map((row) => row.conversationId).filter((value): value is string => Boolean(value));
  const conversationRows = conversationIds.length
    ? await db
        .select({ id: conversations.id, lastMessageAt: conversations.lastMessageAt })
        .from(conversations)
        .where(inArray(conversations.id, conversationIds))
    : [];
  const lastMessageAt = new Map(conversationRows.map((row) => [row.id, row.lastMessageAt]));
  const current = await db
    .select({ jobId: copilotSuggestions.jobId, fingerprint: copilotSuggestions.fingerprint })
    .from(copilotSuggestions)
    .where(and(eq(copilotSuggestions.current, 1), inArray(copilotSuggestions.jobId, rows.map((row) => row.id))));
  const currentByJob = new Map(current.map((row) => [row.jobId, row.fingerprint]));
  const items = rows
    .map((row) => {
      const fingerprint = fingerprintFor(row.updatedAt, row.conversationId ? lastMessageAt.get(row.conversationId) : null);
      return {
        orgId: row.orgId,
        leaseKey: `${row.id}:${fingerprint}`,
        task: "agent.copilot_suggestion",
        payload: { jobId: row.id, fingerprint },
      };
    })
    .filter((item) => currentByJob.get(item.payload.jobId as string) !== item.payload.fingerprint);
  if (!items.length) return items;
  const leased = await db
    .select({ key: agentLeases.leaseKey })
    .from(agentLeases)
    .where(and(eq(agentLeases.agentId, AGENT_ID.copilot), inArray(agentLeases.leaseKey, items.map((item) => item.leaseKey))));
  const seen = new Set(leased.map((row) => row.key));
  return items.filter((item) => !seen.has(item.leaseKey));
};

registerWorkSource(AGENT_ID.copilot, copilotWork);

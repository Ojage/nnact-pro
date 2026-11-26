// Price Book Agent: once a day per organization, find prices that have gone
// stale and propose fresh ones from real supplier bills, for a person to
// confirm. Matching and pricing are the server's code; this agent never
// writes a price and never confirms one.
import { and, eq, sql } from "drizzle-orm";
import { db, priceBookItems } from "@nnact/db";
import { AGENT_ID } from "@nnact/shared";
import type { AgentPlatformApi } from "../../platform/api.js";
import type { AgentOffice } from "../../platform/office.js";
import { registerWorkSource, type WorkItem } from "../../platform/work-source.js";

export const PROMPT_VERSION = "pricebook-v1";
const MAX_PROPOSALS_PER_RUN = 25;

interface Freshness {
  stale: Array<{ itemId: string; name: string; category: string; daysStale: number | null }>;
  matches: Array<{ itemId: string; billLineId: string; description: string; unitPriceCents: number; issueDate: string }>;
}

export async function processPricebookScan(api: AgentPlatformApi, office: AgentOffice, orgId: string, leaseId?: string): Promise<void> {
  const run = await office.beginRun(
    { orgId, task: "agent.price_observation", input: { scan: "daily" }, promptVersion: PROMPT_VERSION },
    { label: "Checking price freshness", steps: 2, leaseId },
  );
  const finish = (input: Parameters<AgentPlatformApi["finishRun"]>[1]) => api.finishRun(run.id, input);
  try {
    const freshness = await run.step("scan", "Find stale prices and matching purchases", () => api.agentFetch<Freshness>("/api/v1/agent/pricebook/freshness", orgId), {
      summarize: (result) => ({ fields: { stale: result.stale.length, matches: result.matches.length } }),
    });

    const proposals = freshness.matches.slice(0, MAX_PROPOSALS_PER_RUN);
    const proposed = await run.step(
      "propose",
      "Propose observations for confirmation",
      async () => {
        let created = 0;
        for (const match of proposals) {
          const result = await api.agentFetch<{ created: boolean }>("/api/v1/agent/pricebook/observations", orgId, {
            itemId: match.itemId,
            billLineId: match.billLineId,
            runId: run.id,
          });
          if (result.created) created += 1;
        }
        return created;
      },
      { summarize: (created) => ({ fields: { proposed: created } }) },
    );

    const withoutEvidence = freshness.stale.filter((item) => !freshness.matches.some((match) => match.itemId === item.itemId));
    if (withoutEvidence.length) {
      await run.log("info", "stale prices with no recent purchase to propose from", { count: withoutEvidence.length });
    }
    await finish({
      orgId,
      state: proposed > 0 || freshness.stale.length > 0 ? "completed" : "skipped",
      output: {
        stale: freshness.stale.length,
        proposed,
        needsManualPrice: withoutEvidence.slice(0, 50).map((item) => ({ itemId: item.itemId, name: item.name, category: item.category, daysStale: item.daysStale })),
      },
      costCents: 0,
      promptVersion: PROMPT_VERSION,
      outcome: proposed > 0 ? "proposed" : freshness.stale.length ? "stale_without_evidence" : "fresh",
    });
    await run.end();
  } catch (error) {
    await finish({ orgId, state: "failed", error: (error as Error).message.slice(0, 1000), promptVersion: PROMPT_VERSION, outcome: "failure" }).catch(() => undefined);
    await run.end(true);
    throw error;
  }
}

/** One scan per organization with an active Price Book, per local day. */
export async function pricebookWork(limit: number, now: Date): Promise<WorkItem[]> {
  const day = now.toISOString().slice(0, 10);
  const orgsWithBooks = await db
    .selectDistinct({ orgId: priceBookItems.orgId })
    .from(priceBookItems)
    .where(
      and(
        eq(priceBookItems.active, true),
        sql`not exists (select 1 from agent_leases l where l.agent_id = ${AGENT_ID.pricebook} and l.lease_key = ${priceBookItems.orgId}::text || ':' || ${day})`,
      ),
    )
    .limit(limit);
  return orgsWithBooks.map((row) => ({ orgId: row.orgId, leaseKey: `${row.orgId}:${day}`, task: "agent.price_observation", payload: { day } }));
}

registerWorkSource(AGENT_ID.pricebook, pricebookWork);

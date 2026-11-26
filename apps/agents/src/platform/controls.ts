import { and, eq, gte, inArray, sum } from "drizzle-orm";
import { db, agentControls, aiUsageRecords } from "@nnact/db";
import { AGENT_REGISTRY, type AgentId } from "@nnact/shared";
import { createAgentKillSwitches, type AgentCostDecision, type AgentCostGuard } from "@nnact/agent-kit";

function todayStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseEnvCap(value: string | undefined): { present: boolean; valid: boolean; cap: number } {
  if (value === undefined) return { present: false, valid: true, cap: 200 };
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return { present: true, valid: false, cap: 0 };
  const cap = Number(trimmed);
  if (!Number.isSafeInteger(cap) || cap < 0) return { present: true, valid: false, cap: 0 };
  return { present: true, valid: true, cap };
}

function normalizeDbCap(value: number | null | undefined): { valid: boolean; cap: number | null } {
  if (value == null) return { valid: true, cap: null };
  if (!Number.isSafeInteger(value) || value < 0) return { valid: false, cap: null };
  return { valid: true, cap: value };
}

export async function getAgentControl(agentId: AgentId) {
  const [row] = await db.select().from(agentControls).where(eq(agentControls.agentId, agentId)).limit(1);
  return row ?? null;
}

export function createDbKillSwitch(env: NodeJS.ProcessEnv = process.env) {
  const envKill = createAgentKillSwitches({ env });
  return async (agentId: AgentId): Promise<boolean> => {
    if (await envKill(agentId)) return true;
    const control = await getAgentControl(agentId);
    return control?.enabled === false;
  };
}

export async function getDailySpendCents(agentId: AgentId, orgId: string, now: Date = new Date()): Promise<number> {
  const tasks = [...AGENT_REGISTRY[agentId].taskLabels];
  if (tasks.length === 0) return 0;
  const [row] = await db
    .select({ value: sum(aiUsageRecords.costCents) })
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.orgId, orgId),
        gte(aiUsageRecords.createdAt, todayStartUtc(now)),
        inArray(aiUsageRecords.task, tasks),
      ),
    );
  return Number(row?.value ?? 0);
}

export function createDbCostGuard(env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): AgentCostGuard {
  return {
    async check(input: { agentId: AgentId; orgId: string }): Promise<AgentCostDecision> {
      try {
        const control = await getAgentControl(input.agentId);
        const dbCap = normalizeDbCap(control?.costCapCents);
        if (!dbCap.valid) {
          return { allowed: false, spendCents: null, capCents: null, reason: "invalid cost cap" };
        }
        let capCents = dbCap.cap;
        if (capCents == null) {
          const envCap = parseEnvCap(env[AGENT_REGISTRY[input.agentId].costCapEnv]);
          if (!envCap.valid) {
            return { allowed: false, spendCents: null, capCents: null, reason: "invalid cost cap" };
          }
          capCents = envCap.cap;
        }
        const spendCents = await getDailySpendCents(input.agentId, input.orgId, now());
        if (!Number.isFinite(spendCents) || spendCents < 0) {
          return { allowed: false, spendCents: null, capCents, reason: "invalid spend" };
        }
        if (spendCents >= capCents) {
          return { allowed: false, spendCents, capCents, reason: "cost cap exceeded" };
        }
        return { allowed: true, spendCents, capCents, reason: null };
      } catch (error) {
        return { allowed: false, spendCents: null, capCents: null, reason: `spend check failed: ${(error as Error).message}` };
      }
    },
  };
}

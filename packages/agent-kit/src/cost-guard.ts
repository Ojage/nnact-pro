import { AGENT_REGISTRY, type AgentId } from "@nnact/shared";
import { toErrorMessage } from "./util.js";

export interface AgentCostCheck {
  agentId: AgentId;
  orgId: string;
}

export interface AgentCostDecision {
  allowed: boolean;
  spendCents: number | null;
  capCents: number | null;
  reason: string | null;
}

export interface AgentCostGuard {
  check(input: AgentCostCheck): Promise<AgentCostDecision>;
}

export interface AgentCostGuardOptions {
  getSpendCents: (agentId: AgentId, orgId: string) => number | Promise<number>;
  env?: Record<string, string | undefined>;
}

export function agentCostCapEnv(agentId: AgentId): string {
  return AGENT_REGISTRY[agentId].costCapEnv;
}

export function parseCostCap(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const cap = Number(trimmed);
  return Number.isSafeInteger(cap) && cap >= 0 ? cap : null;
}

export function createAgentCostGuard(options: AgentCostGuardOptions): AgentCostGuard {
  const env = options.env ?? process.env;
  return {
    async check(input) {
      const capCents = parseCostCap(env[agentCostCapEnv(input.agentId)]);
      if (capCents === null) {
        return { allowed: false, spendCents: null, capCents: null, reason: "invalid cost cap" };
      }
      try {
        const spendCents = await options.getSpendCents(input.agentId, input.orgId);
        if (!Number.isFinite(spendCents) || spendCents < 0) {
          return { allowed: false, spendCents: null, capCents, reason: "invalid spend" };
        }
        if (spendCents >= capCents) {
          return { allowed: false, spendCents, capCents, reason: "cost cap exceeded" };
        }
        return { allowed: true, spendCents, capCents, reason: null };
      } catch (error) {
        return { allowed: false, spendCents: null, capCents, reason: `spend check failed: ${toErrorMessage(error)}` };
      }
    },
  };
}

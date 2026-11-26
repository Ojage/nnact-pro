import { AGENT_ID, AGENT_REGISTRY, resolveAgentId, type AgentId } from "@nnact/shared";

const LEGACY_AGENT_IDS: Record<AgentId, string> = {
  [AGENT_ID.intake]: "nnact-intake-agent",
  [AGENT_ID.quoting]: "nnact-quoting-agent",
  [AGENT_ID.dispatch]: "nnact-dispatch-agent",
  [AGENT_ID.pricebook]: "nnact-pricebook-agent",
  [AGENT_ID.triage]: "nnact-triage-agent",
  [AGENT_ID.sourcing]: "nnact-sourcing-agent",
  [AGENT_ID.copilot]: "nnact-copilot-agent",
  [AGENT_ID.payments]: "nnact-payments-agent",
};

/** Agents with a worker in this process, in start order. */
export const RUNNABLE_AGENT_IDS: readonly AgentId[] = [
  AGENT_ID.intake,
  AGENT_ID.quoting,
  AGENT_ID.dispatch,
  AGENT_ID.pricebook,
  AGENT_ID.triage,
  AGENT_ID.sourcing,
  AGENT_ID.payments,
];

const SHORT_NAMES: Record<string, AgentId> = {
  intake: AGENT_ID.intake,
  quoting: AGENT_ID.quoting,
  quote: AGENT_ID.quoting,
  dispatch: AGENT_ID.dispatch,
  pricebook: AGENT_ID.pricebook,
  "price-book": AGENT_ID.pricebook,
  triage: AGENT_ID.triage,
  sourcing: AGENT_ID.sourcing,
  payments: AGENT_ID.payments,
};

export function legacyAgentId(agentId: AgentId): string {
  return LEGACY_AGENT_IDS[agentId];
}

/**
 * Which agents this process runs. `AGENT_NAME` (or the older `AGENT_ID`) takes
 * one name, a comma-separated list, or `all`. `all` means the agents whose
 * stage is live plus any whose feature flag is explicitly on.
 */
export function resolveSelectedAgentIds(env: NodeJS.ProcessEnv = process.env): AgentId[] {
  const raw = (env.AGENT_NAME ?? env.AGENT_ID ?? "all").trim().toLowerCase();
  if (!raw || raw === "all") {
    return RUNNABLE_AGENT_IDS.filter((agentId) => AGENT_REGISTRY[agentId].stage === "live" || flagOn(agentId, env));
  }
  const selected: AgentId[] = [];
  for (const part of raw.split(",").map((value) => value.trim()).filter(Boolean)) {
    const agentId = SHORT_NAMES[part] ?? (part === "nnact-quote-agent" ? AGENT_ID.quoting : resolveAgentId(part));
    if (!agentId || !RUNNABLE_AGENT_IDS.includes(agentId)) throw new Error(`unsupported AGENT_NAME/AGENT_ID: ${part}`);
    if (!selected.includes(agentId)) selected.push(agentId);
  }
  return selected;
}

function flagOn(agentId: AgentId, env: NodeJS.ProcessEnv): boolean {
  const key = AGENT_REGISTRY[agentId].featureFlagKey.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return ["true", "1", "on", "yes", "enabled"].includes((env[key] ?? "").trim().toLowerCase());
}

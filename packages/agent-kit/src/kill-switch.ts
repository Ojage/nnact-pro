import { AGENT_IDS, AGENT_REGISTRY, type AgentId } from "@nnact/shared";

export type AgentKillSwitch = (agentId: AgentId) => boolean | Promise<boolean>;

export interface AgentKillSwitchOptions {
  env?: Record<string, string | undefined>;
  enabledByDefault?: readonly AgentId[];
}

export function agentFlagEnvKey(agentId: AgentId): string {
  return AGENT_REGISTRY[agentId].featureFlagKey.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

export function parseAgentFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["false", "0", "off", "no", "disabled"].includes(normalized)) return false;
  if (["true", "1", "on", "yes", "enabled"].includes(normalized)) return true;
  return fallback;
}

export function createAgentKillSwitches(options: AgentKillSwitchOptions = {}): AgentKillSwitch {
  const env = options.env ?? process.env;
  const enabledByDefault = new Set<AgentId>(options.enabledByDefault ?? AGENT_IDS);
  return (agentId) => !parseAgentFlag(env[agentFlagEnvKey(agentId)], enabledByDefault.has(agentId));
}

export function createAgentEnabledCheck(options: AgentKillSwitchOptions = {}): (agentId: AgentId) => Promise<boolean> {
  const killSwitch = createAgentKillSwitches(options);
  return async (agentId) => !(await killSwitch(agentId));
}

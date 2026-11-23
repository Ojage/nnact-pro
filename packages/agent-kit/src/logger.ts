import type { AgentId } from "@nnact/shared";

export type AgentRunOutcome =
  | "success"
  | "failure"
  | "dead_letter"
  | "cost_cap_denied"
  | "skipped";

export interface AgentRunLogFields {
  agentId: AgentId;
  orgId: string | null;
  task: string;
  promptVersion?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  outcome?: AgentRunOutcome | null;
  error?: string | null;
  latencyMs?: number | null;
  leaseId?: string | null;
  attempt?: number | null;
}

export interface AgentRunLogEvent {
  event: "agent.run.start" | "agent.run.finish";
  level: "info" | "warn";
  timestamp: string;
  agentId: AgentId;
  orgId: string | null;
  task: string;
  promptVersion: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  outcome: AgentRunOutcome | null;
  error: string | null;
  latencyMs: number | null;
  leaseId: string | null;
  attempt: number | null;
}

export interface AgentRunLogger {
  start(fields: AgentRunLogFields): void | Promise<void>;
  finish(fields: AgentRunLogFields): void | Promise<void>;
}

export type AgentLogSink = (event: AgentRunLogEvent) => void | Promise<void>;

function normalize(event: AgentRunLogEvent["event"], fields: AgentRunLogFields, clock: () => Date): AgentRunLogEvent {
  const level = event === "finish" && fields.outcome !== "success" ? "warn" : "info";
  return {
    event,
    level,
    timestamp: clock().toISOString(),
    agentId: fields.agentId,
    orgId: fields.orgId ?? null,
    task: fields.task,
    promptVersion: fields.promptVersion ?? null,
    model: fields.model ?? null,
    inputTokens: fields.inputTokens ?? null,
    outputTokens: fields.outputTokens ?? null,
    costCents: fields.costCents ?? null,
    outcome: fields.outcome ?? null,
    error: fields.error ?? null,
    latencyMs: fields.latencyMs ?? null,
    leaseId: fields.leaseId ?? null,
    attempt: fields.attempt ?? null,
  };
}

export function createStructuredAgentLogger(
  sink: AgentLogSink = (event) => { console.log(JSON.stringify(event)); },
  clock: () => Date = () => new Date(),
): AgentRunLogger {
  return {
    async start(fields) {
      await sink(normalize("agent.run.start", fields, clock));
    },
    async finish(fields) {
      await sink(normalize("agent.run.finish", fields, clock));
    },
  };
}

export function createNoopAgentRunLogger(): AgentRunLogger {
  return { start() {}, finish() {} };
}

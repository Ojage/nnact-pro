import { AGENT_REGISTRY, AGENT_SCOPES, type AgentId, type AgentScope } from "@nnact/shared";
import { createAgentToken } from "../lib/helpers.js";

export interface AgentPlatformApiOptions {
  apiUrl: string;
  tokenFor: (orgId: string) => string;
}

export interface StartRunInput {
  orgId: string;
  task: string;
  input: Record<string, unknown>;
  conversationId?: string | null;
  messageId?: string | null;
  jobId?: string | null;
  promptVersion?: string | null;
  leaseId?: string;
}

export interface FinishRunInput {
  orgId: string;
  state: "completed" | "failed" | "skipped";
  output?: Record<string, unknown>;
  provider?: string | null;
  model?: string | null;
  costCents?: number | null;
  error?: string | null;
  jobId?: string | null;
  latencyMs?: number | null;
  promptVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  outcome?: string | null;
}

export interface CreateMessageInput {
  orgId: string;
  conversationId: string;
  externalId?: string | null;
  direction: "inbound" | "outbound";
  fromAddress?: string | null;
  toAddress?: string | null;
  text?: string | null;
  transcript?: string | null;
  followUpIndex?: number | null;
  sentAt?: string | null;
}

export interface UpdateConversationInput {
  orgId: string;
  needsTemplate?: boolean;
  followUpCount?: number;
  state?: "open" | "awaiting_customer" | "needs_choice" | "needs_template" | "closed";
  lastMessageAt?: string | null;
}

export const INTAKE_TOKEN_SCOPES: AgentScope[] = [
  AGENT_SCOPES.draftJobsCreate,
  AGENT_SCOPES.agentRunsWrite,
  AGENT_SCOPES.messagesWrite,
  AGENT_SCOPES.conversationsWrite,
];

export const QUOTING_TOKEN_SCOPES: AgentScope[] = [
  AGENT_SCOPES.jobsRead,
  AGENT_SCOPES.priceBookRead,
  AGENT_SCOPES.quoteProposalsCreate,
  AGENT_SCOPES.agentRunsWrite,
];

function compact<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null)) as T;
}

export class AgentPlatformApi {
  private readonly apiUrl: string;
  private readonly tokenFor: (orgId: string) => string;

  constructor(options: AgentPlatformApiOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.tokenFor = options.tokenFor;
  }

  private async request<T>(method: string, path: string, orgId: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.tokenFor(orgId)}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json().catch(() => ({}))) as T & { error?: unknown };
    if (!response.ok) throw new Error(`agent API ${path} returned ${response.status}: ${JSON.stringify(json.error ?? json)}`);
    return json;
  }

  async startRun(input: StartRunInput): Promise<{ id: string }> {
    const row = await this.request<{ id: string }>("POST", "/api/v1/agent/platform/runs", input.orgId, compact(input));
    return row;
  }

  async finishRun(runId: string, input: FinishRunInput): Promise<void> {
    await this.request("PATCH", `/api/v1/agent/platform/runs/${runId}`, input.orgId, compact(input));
  }

  // ---- Agent Office telemetry -------------------------------------------
  async heartbeat(orgId: string, body: Record<string, unknown>): Promise<void> {
    await this.request("POST", "/api/v1/agent/platform/heartbeat", orgId, body);
  }

  async putStep(
    orgId: string,
    runId: string,
    seq: number,
    body: {
      name: string;
      label: string;
      status: "pending" | "running" | "completed" | "failed" | "skipped";
      summary?: string | null;
      fields?: Record<string, string | number | boolean | null | undefined>;
    },
  ): Promise<void> {
    await this.request("PUT", `/api/v1/agent/platform/runs/${runId}/steps/${seq}`, orgId, body);
  }

  async postLogs(
    orgId: string,
    lines: Array<{ level: string; message: string; fields?: Record<string, unknown>; runId?: string }>,
  ): Promise<void> {
    await this.request("POST", "/api/v1/agent/platform/logs", orgId, { lines });
  }

  async setMessageTranscript(messageId: string, orgId: string, transcript: string): Promise<void> {
    await this.request("PATCH", `/api/v1/agent/platform/messages/${messageId}/transcript`, orgId, { orgId, transcript });
  }

  async createMessage(input: CreateMessageInput): Promise<void> {
    await this.request("POST", "/api/v1/agent/platform/messages", input.orgId, compact(input));
  }

  async updateConversation(conversationId: string, input: UpdateConversationInput): Promise<void> {
    await this.request("PATCH", `/api/v1/agent/platform/conversations/${conversationId}`, input.orgId, compact(input));
  }

  async postIntakeDraft(orgId: string, payload: unknown): Promise<{ status?: string; job?: { id: string } }> {
    return this.request("POST", "/api/v1/agent/intake/draft-jobs", orgId, payload);
  }

  async agentFetch<T>(path: string, orgId: string, body?: unknown): Promise<T> {
    return this.request<T>(body === undefined ? "GET" : "POST", path, orgId, body);
  }
}

export function createIntakeApi(apiUrl: string, tokenFor: (orgId: string) => string): AgentPlatformApi {
  return new AgentPlatformApi({ apiUrl, tokenFor });
}

export function createQuotingApi(apiUrl: string, tokenFor: (orgId: string) => string): AgentPlatformApi {
  return new AgentPlatformApi({ apiUrl, tokenFor });
}

/** A token for one agent carrying exactly its registry scopes. */
export function tokenForAgent(agentId: AgentId, legacyAgentId: string, scopes: AgentScope[] = [...AGENT_REGISTRY[agentId].scopes] as AgentScope[]) {
  return (orgId: string) => createAgentToken({ orgId, agentId, legacyAgentId, scopes });
}

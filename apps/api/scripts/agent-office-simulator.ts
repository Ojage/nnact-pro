// Agent Office simulator: makes every agent look busy so the page can be built
// and demoed without WhatsApp or a model provider. It talks to the API exactly
// as the real agents do, with each agent's own scoped token, so it exercises
// the ingest endpoints, redaction and the live stream end to end.
//
//   pnpm --filter @nnact/api agent-office:simulate               # forever
//   pnpm --filter @nnact/api agent-office:simulate -- --once     # one run per agent
//   options: --org <uuid> --api <url> --speed <factor> --errors <0..1>
//
// Development only: refuses to run when NODE_ENV=production. It writes real
// agent_runs rows (task names are real, content is fake and marked simulated).
import { createHmac, randomUUID } from "node:crypto";
import { AGENT_IDS, AGENT_REGISTRY, AGENT_SCOPES, type AgentId } from "@nnact/shared";

interface Options {
  apiUrl: string;
  orgId: string | null;
  once: boolean;
  speed: number;
  errorRate: number;
  includePlanned: boolean;
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    apiUrl: process.env.AGENT_API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 3001}`,
    orgId: process.env.SIMULATOR_ORG_ID ?? null,
    once: false,
    speed: 1,
    errorRate: 0.12,
    includePlanned: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--once") options.once = true;
    else if (flag === "--all") options.includePlanned = true;
    else if (flag === "--api") options.apiUrl = argv[++index] ?? options.apiUrl;
    else if (flag === "--org") options.orgId = argv[++index] ?? null;
    else if (flag === "--speed") options.speed = Math.max(0.1, Number(argv[++index]) || 1);
    else if (flag === "--errors") options.errorRate = Math.min(1, Math.max(0, Number(argv[++index]) || 0));
  }
  return options;
}

/** HS256 token in the same shape the agents mint (aud "agent", one agent, its scopes). */
function agentToken(agentId: AgentId, orgId: string): string {
  const secret = process.env.JWT_SECRET?.trim() || "nnactpro-development-only-secret";
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    aud: "agent",
    agent_id: agentId,
    orgId,
    scope: AGENT_SCOPES.agentRunsWrite,
    scopes: [AGENT_SCOPES.agentRunsWrite],
    iat: now,
    exp: now + 3_600,
  });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

interface Script {
  task: string;
  label: string;
  steps: Array<{ name: string; label: string; summary?: string; fields?: Record<string, unknown> }>;
}

const SCRIPTS: Record<AgentId, Script[]> = {
  "intake-agent": [
    {
      task: "agent.extract",
      label: "Drafting job from WhatsApp",
      steps: [
        { name: "receive", label: "Receive message", summary: 'Customer wrote "my fridge stopped cooling since yesterday"', fields: { language: "fr", phone: "+237 650 00 00 00" } },
        { name: "safety", label: "Check safety words", fields: { flagged: false } },
        { name: "extract", label: "Extract job fields", fields: { fields: 6, confidence: 0.82 } },
        { name: "draft", label: "Save draft for review", fields: { needsFollowUp: false } },
      ],
    },
    {
      task: "agent.followup",
      label: "Asking a follow-up question",
      steps: [
        { name: "missing", label: "Find missing fields", fields: { missing: "address" } },
        { name: "template", label: "Send templated question", fields: { template: "ask_address_fr" } },
      ],
    },
  ],
  "quoting-agent": [
    {
      task: "agent.quote",
      label: "Drafting a quote proposal",
      steps: [
        { name: "job", label: "Read the job", fields: { category: "refrigeration" } },
        { name: "candidates", label: "Match price book items", fields: { matched: 4, needsManualPrice: 1 } },
        { name: "propose", label: "Write the proposal", fields: { lines: 5 } },
      ],
    },
  ],
  "dispatch-agent": [
    {
      task: "agent.dispatch",
      label: "Ranking technicians",
      steps: [
        { name: "eligible", label: "Apply hard constraints", fields: { technicians: 7, eligible: 4 } },
        { name: "score", label: "Score candidates", fields: { topScore: 61 } },
        { name: "reasons", label: "Write reasons", fields: { shadow: true } },
      ],
    },
  ],
  "pricebook-agent": [
    {
      task: "agent.price_observation",
      label: "Checking price freshness",
      steps: [
        { name: "stale", label: "Find stale prices", fields: { stale: 3 } },
        { name: "observe", label: "Propose observations", fields: { proposed: 2 } },
      ],
    },
  ],
  "triage-agent": [
    {
      task: "agent.triage",
      label: "Estimating the likely fault",
      steps: [
        { name: "symptoms", label: "Read symptoms", fields: { photos: 2 } },
        { name: "fault", label: "Rank likely faults", fields: { top: "start relay" } },
      ],
    },
  ],
  "sourcing-agent": [
    {
      task: "agent.sourcing",
      label: "Building a shopping list",
      steps: [
        { name: "parts", label: "List parts", fields: { parts: 3 } },
        { name: "shops", label: "Compare shops", fields: { shops: 4 } },
      ],
    },
  ],
  "copilot-agent": [
    {
      task: "agent.copilot_suggestion",
      label: "Helping a technician",
      steps: [{ name: "checklist", label: "Prepare checklist", fields: { items: 8 } }],
    },
  ],
  "payments-agent": [
    {
      task: "agent.payment_reminder",
      label: "Sending a payment reminder",
      steps: [
        { name: "due", label: "Find due invoices", fields: { due: 2 } },
        { name: "remind", label: "Queue templated reminder", fields: { template: "reminder_1" } },
      ],
    },
  ],
};

const ERRORS = ["provider_timeout: model call exceeded 30s", "schema_invalid: extraction did not match the draft schema", "rate_limited: provider returned 429"];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const between = (low: number, high: number) => low + Math.random() * (high - low);

class SimulatedAgent {
  private readonly instanceId = `sim-${randomUUID().slice(0, 8)}`;
  private readonly token: string;
  private status: "idle" | "working" | "waiting" | "error" = "idle";
  private current: Record<string, unknown> | null = null;
  private readonly agentId: AgentId;
  private readonly options: Options;
  private readonly orgId: string;

  constructor(agentId: AgentId, orgId: string, options: Options) {
    this.agentId = agentId;
    this.orgId = orgId;
    this.options = options;
    this.token = agentToken(agentId, orgId);
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.options.apiUrl}/api/agent/platform${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${(await response.text()).slice(0, 200)}`);
    return response.status === 204 ? null : response.json();
  }

  heartbeat(): Promise<unknown> {
    return this.call("POST", "/heartbeat", {
      instanceId: this.instanceId,
      status: this.status,
      version: "simulator",
      promptVersion: `${this.agentId}-sim`,
      current: this.current,
    });
  }

  private log(level: "debug" | "info" | "warn" | "error", message: string, runId?: string, fields?: Record<string, unknown>) {
    return this.call("POST", "/logs", { lines: [{ level, message, runId, fields }] });
  }

  async runOnce(): Promise<void> {
    const script = pick(SCRIPTS[this.agentId]);
    const run = (await this.call("POST", "/runs", {
      orgId: this.orgId,
      task: script.task,
      input: { simulated: true, note: "Agent Office simulator run" },
      promptVersion: `${this.agentId}-sim`,
    })) as { id: string };
    const startedAt = new Date().toISOString();
    const fails = Math.random() < this.options.errorRate;
    const failAt = fails ? Math.floor(Math.random() * script.steps.length) : -1;
    const began = Date.now();
    await this.log("info", `run started: ${script.label}`, run.id, { task: script.task });

    for (const [index, step] of script.steps.entries()) {
      const seq = index + 1;
      this.status = step.name === "template" ? "waiting" : "working";
      this.current = { runId: run.id, task: script.task, label: script.label, stepName: step.name, stepIndex: seq, stepCount: script.steps.length, startedAt };
      await this.heartbeat();
      await this.call("PUT", `/runs/${run.id}/steps/${seq}`, { name: step.name, label: step.label, status: "running" });
      await sleep(between(800, 3_000) / this.options.speed);
      if (index === failAt) {
        const error = pick(ERRORS);
        await this.call("PUT", `/runs/${run.id}/steps/${seq}`, { name: step.name, label: step.label, status: "failed", summary: error });
        await this.log("error", `step ${step.name} failed: ${error}`, run.id);
        await this.call("PATCH", `/runs/${run.id}`, { orgId: this.orgId, state: "failed", error, latencyMs: Date.now() - began, costCents: Math.round(between(1, 4)) });
        this.status = "error";
        this.current = null;
        await this.heartbeat();
        return;
      }
      await this.call("PUT", `/runs/${run.id}/steps/${seq}`, {
        name: step.name,
        label: step.label,
        status: "completed",
        summary: step.summary ?? null,
        fields: step.fields,
      });
      await this.log(Math.random() < 0.1 ? "warn" : "info", `${step.label.toLowerCase()} done`, run.id, step.fields);
    }

    const inputTokens = Math.round(between(600, 4_000));
    const outputTokens = Math.round(between(80, 600));
    await this.call("PATCH", `/runs/${run.id}`, {
      orgId: this.orgId,
      state: "completed",
      output: { simulated: true },
      provider: "simulator",
      model: "sim-1",
      latencyMs: Date.now() - began,
      costCents: Math.max(1, Math.round((inputTokens + outputTokens * 4) / 1_000)),
      inputTokens,
      outputTokens,
      outcome: "ok",
    });
    this.status = "idle";
    this.current = null;
    await this.heartbeat();
  }

  async loop(stop: { value: boolean }): Promise<void> {
    const beat = setInterval(() => void this.heartbeat().catch(() => undefined), 30_000);
    try {
      while (!stop.value) {
        try {
          await this.runOnce();
        } catch (error) {
          console.error(`[${this.agentId}] ${(error as Error).message}`);
          await sleep(5_000);
        }
        if (this.options.once) break;
        await sleep(between(3_000, 15_000) / this.options.speed);
      }
    } finally {
      clearInterval(beat);
    }
  }
}

async function resolveOrg(options: Options): Promise<string> {
  if (options.orgId) return options.orgId;
  // Read-only lookup of the first organization in the development database.
  const { db, orgs, closeDb } = await import("@nnact/db");
  const [org] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  await closeDb();
  if (!org) throw new Error("no organization found; seed the database or pass --org <uuid>");
  return org.id;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("the Agent Office simulator never runs in production");
  const options = parseOptions(process.argv.slice(2));
  const orgId = await resolveOrg(options);
  const agents = AGENT_IDS.filter((id) => options.includePlanned || AGENT_REGISTRY[id].stage !== "planned");
  console.log(`simulating ${agents.join(", ")} for org ${orgId} against ${options.apiUrl}${options.once ? " (once)" : ""}`);
  const stop = { value: false };
  process.once("SIGINT", () => {
    stop.value = true;
    console.log("stopping after the current runs…");
  });
  await Promise.all(agents.map((agentId) => new SimulatedAgent(agentId, orgId, options).loop(stop)));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});

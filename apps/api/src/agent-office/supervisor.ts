import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_ID, type AgentId } from "@nnact/shared";

type SupervisorLogger = {
  info(message: string): void;
  error(message: string): void;
};

type ProcessResult = {
  ok: boolean;
  started?: boolean;
  pid?: number;
  error?: string;
};

const WORKER_NAMES: Partial<Record<AgentId, string>> = {
  [AGENT_ID.intake]: "intake",
  [AGENT_ID.quoting]: "quoting",
  [AGENT_ID.dispatch]: "dispatch",
  [AGENT_ID.pricebook]: "price-book",
  [AGENT_ID.triage]: "triage",
  [AGENT_ID.sourcing]: "sourcing",
  [AGENT_ID.copilot]: "copilot",
  [AGENT_ID.payments]: "payments",
};

const DEFAULT_AGENT_IDS = Object.values(AGENT_ID).filter((agentId) => WORKER_NAMES[agentId]);

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const children = new Map<AgentId, ChildProcess>();

function pipeOutput(stream: NodeJS.ReadableStream | null, logger: SupervisorLogger | undefined, agentId: AgentId, level: "info" | "error") {
  stream?.on("data", (chunk: Buffer | string) => {
    const text = String(chunk).trim();
    if (text) logger?.[level](`[agents:${agentId}] ${text}`);
  });
}

function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveTermination) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 4_000);
    child.once("exit", () => {
      clearTimeout(force);
      resolveTermination();
    });
    child.kill("SIGTERM");
  });
}

export async function startAgentProcess(agentId: AgentId, logger?: SupervisorLogger): Promise<ProcessResult> {
  const workerName = WORKER_NAMES[agentId];
  if (!workerName) {
    return { ok: false, error: "This agent runs in the web app and does not have a background worker." };
  }

  const existing = children.get(agentId);
  if (existing && existing.exitCode === null && existing.signalCode === null) {
    return { ok: true, started: false, pid: existing.pid };
  }

  const apiPort = process.env.API_PORT ?? "3003";
  const env = {
    ...process.env,
    AGENT_NAME: workerName,
    AGENT_API_URL: `http://127.0.0.1:${apiPort}`,
  };

  const child = spawn("pnpm", ["--filter", "@nnact/agents", "exec", "tsx", "src/index.ts"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set(agentId, child);
  pipeOutput(child.stdout, logger, agentId, "info");
  pipeOutput(child.stderr, logger, agentId, "error");
  child.once("exit", (code, signal) => {
    if (children.get(agentId) === child) children.delete(agentId);
    logger?.info(`[agents:${agentId}] worker exited (code ${code ?? "null"}, signal ${signal ?? "null"})`);
  });
  child.once("error", (error) => {
    if (children.get(agentId) === child) children.delete(agentId);
    logger?.error(`[agents:${agentId}] worker failed to start: ${error.message}`);
  });

  return { ok: true, started: true, pid: child.pid };
}

export async function stopAgentProcess(agentId: AgentId): Promise<void> {
  const child = children.get(agentId);
  if (!child) return;
  children.delete(agentId);
  await terminateChild(child);
}

export async function restartAgentProcess(agentId: AgentId, logger?: SupervisorLogger): Promise<ProcessResult> {
  await stopAgentProcess(agentId);
  return startAgentProcess(agentId, logger);
}

export async function startDefaultAgentProcesses(logger?: SupervisorLogger): Promise<void> {
  for (const agentId of DEFAULT_AGENT_IDS) {
    const result = await startAgentProcess(agentId, logger);
    if (!result.ok) logger?.error(`[agents:${agentId}] ${result.error ?? "Could not start"}`);
  }
}

export async function stopAllAgentProcesses(): Promise<void> {
  await Promise.all([...children.keys()].map((agentId) => stopAgentProcess(agentId)));
}

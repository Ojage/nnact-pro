// Agent Office telemetry for one agent in this process: heartbeats, run steps
// and log lines, sent to the API with the agent's own token. Telemetry is best
// effort: a failure to report is logged locally and never fails the work.
import { randomUUID } from "node:crypto";
import type { AgentId } from "@nnact/shared";
import type { AgentPlatformApi, StartRunInput } from "./api.js";

const HEARTBEAT_EVERY_MS = 30_000;
const VERSION = process.env.AGENT_VERSION ?? process.env.npm_package_version ?? "dev";

export type OfficeStatus = "idle" | "working" | "waiting" | "error";
type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

interface CurrentRun {
  runId: string;
  orgId: string;
  task: string;
  label: string;
  stepName: string | null;
  stepIndex: number;
  stepCount: number;
  startedAt: string;
}

export class AgentOffice {
  readonly agentId: AgentId;
  readonly instanceId: string;
  private readonly api: AgentPlatformApi;
  private status: OfficeStatus = "idle";
  private current: CurrentRun | null = null;
  private lastOrgId: string | null = null;
  private promptVersion: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly warn: (message: string) => void;

  constructor(agentId: AgentId, api: AgentPlatformApi, options: { instanceId?: string; warn?: (message: string) => void } = {}) {
    this.agentId = agentId;
    this.api = api;
    this.instanceId = options.instanceId ?? `${process.env.HOSTNAME ?? "local"}-${process.pid}-${randomUUID().slice(0, 6)}`;
    this.warn = options.warn ?? ((message) => console.warn(`[agent] ${agentId} office: ${message}`));
  }

  /** Heartbeats need an org-scoped token; the first org seen is enough when idle. */
  useOrg(orgId: string): void {
    this.lastOrgId ??= orgId;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_EVERY_MS);
    this.timer.unref?.();
    void this.beat();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async beat(): Promise<void> {
    const orgId = this.current?.orgId ?? this.lastOrgId;
    if (!orgId) return;
    await this.safely("heartbeat", () =>
      this.api.heartbeat(orgId, {
        instanceId: this.instanceId,
        status: this.status,
        version: VERSION,
        promptVersion: this.promptVersion ?? undefined,
        current: this.current
          ? {
              runId: this.current.runId,
              task: this.current.task,
              label: this.current.label,
              stepName: this.current.stepName,
              stepIndex: this.current.stepIndex,
              stepCount: this.current.stepCount,
              startedAt: this.current.startedAt,
            }
          : null,
      }),
    );
  }

  async setStatus(status: OfficeStatus): Promise<void> {
    if (status === this.status) return;
    this.status = status;
    await this.beat();
  }

  /** Start a run in agent_runs and on the office floor. */
  async beginRun(
    input: StartRunInput,
    options: { label: string; steps: number; leaseId?: string | null },
  ): Promise<TrackedRun> {
    this.useOrg(input.orgId);
    this.promptVersion = input.promptVersion ?? this.promptVersion;
    const run = await this.api.startRun({ ...input, leaseId: options.leaseId ?? undefined });
    this.current = {
      runId: run.id,
      orgId: input.orgId,
      task: input.task,
      label: options.label,
      stepName: null,
      stepIndex: 0,
      stepCount: options.steps,
      startedAt: new Date().toISOString(),
    };
    this.status = "working";
    await this.beat();
    return new TrackedRun(this, run.id, input.orgId);
  }

  /** @internal */
  async enterStep(seq: number, name: string, waiting: boolean): Promise<void> {
    if (!this.current) return;
    this.current.stepIndex = seq;
    this.current.stepName = name;
    this.status = waiting ? "waiting" : "working";
    await this.beat();
  }

  /** @internal */
  async endRun(failed: boolean): Promise<void> {
    this.current = null;
    this.status = failed ? "error" : "idle";
    await this.beat();
  }

  /** @internal */
  async sendStep(orgId: string, runId: string, seq: number, body: Parameters<AgentPlatformApi["putStep"]>[3]): Promise<void> {
    await this.safely("step", () => this.api.putStep(orgId, runId, seq, body));
  }

  async log(orgId: string, level: LogLevel, message: string, fields?: Fields, runId?: string): Promise<void> {
    this.useOrg(orgId);
    await this.safely("log", () => this.api.postLogs(orgId, [{ level, message, fields, runId }]));
  }

  private async safely(what: string, call: () => Promise<unknown>): Promise<void> {
    try {
      await call();
    } catch (error) {
      this.warn(`${what} not reported: ${(error as Error).message.slice(0, 200)}`);
    }
  }
}

/**
 * One run as the office sees it: numbered steps with plain-language labels.
 * `step()` reports running, then completed or failed, around the work.
 */
export class TrackedRun {
  readonly id: string;
  readonly orgId: string;
  private readonly office: AgentOffice;
  private seq = 0;
  private finished = false;

  constructor(office: AgentOffice, id: string, orgId: string) {
    this.office = office;
    this.id = id;
    this.orgId = orgId;
  }

  async step<T>(
    name: string,
    label: string,
    work: () => Promise<T>,
    options: { waiting?: boolean; summarize?: (result: T) => { summary?: string; fields?: Fields } } = {},
  ): Promise<T> {
    this.seq += 1;
    const seq = this.seq;
    await this.office.enterStep(seq, name, options.waiting === true);
    await this.office.sendStep(this.orgId, this.id, seq, { name, label, status: "running" });
    try {
      const result = await work();
      const summary = options.summarize?.(result) ?? {};
      await this.office.sendStep(this.orgId, this.id, seq, { name, label, status: "completed", summary: summary.summary ?? null, fields: summary.fields });
      return result;
    } catch (error) {
      await this.office.sendStep(this.orgId, this.id, seq, {
        name,
        label,
        status: "failed",
        summary: errorKind(error),
      });
      throw error;
    }
  }

  /** Record a step that was skipped (for example no voice note to transcribe). */
  async skip(name: string, label: string, summary: string): Promise<void> {
    this.seq += 1;
    await this.office.sendStep(this.orgId, this.id, this.seq, { name, label, status: "skipped", summary });
  }

  log(level: LogLevel, message: string, fields?: Fields): Promise<void> {
    return this.office.log(this.orgId, level, message, fields, this.id);
  }

  /** Mark the run over on the floor. agent_runs is finished by the handler. */
  async end(failed = false): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.office.endRun(failed);
  }
}

/** A short, content-free description of an error for step summaries. */
export function errorKind(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const head = message.split(/[:\n]/)[0]!.trim();
  return head.slice(0, 120) || "error";
}

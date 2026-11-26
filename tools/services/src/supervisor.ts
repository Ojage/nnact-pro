// Start, stop and inspect services. The supervisor holds no process handles:
// every decision is made from the run records on disk and the kernel's view
// of those processes, so any supervisor instance (or a restarted one) can
// manage services another instance started.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { requireService, type ServiceDefinition, type ServicesConfig } from "./config.ts";
import { CLI_ENTRY, runFile, type Paths } from "./paths.ts";
import { groupAlive, isPortOpen, ownership, portHolder, procGroup, signalGroup, sleep, waitForGroupExit } from "./proc.ts";
import type { RunRecord } from "./runner.ts";

export type ServiceState = "stopped" | "starting" | "running" | "unhealthy" | "crashed" | "stopping";

export interface ServiceStatus {
  name: string;
  description: string;
  state: ServiceState;
  pid: number | null;
  port: number | null;
  startedAt: string | null;
  uptimeMs: number | null;
  healthy: boolean | null;
  exitCode: number | null;
  detail: string | null;
  autostart: boolean;
}

export interface ActionResult {
  ok: boolean;
  name: string;
  message: string;
  unchanged?: boolean;
}

/** Dev servers can take a while to compile before they answer. */
export const START_GRACE_MS = 90_000;
const DEPENDENCY_WAIT_MS = 60_000;

export function readRunRecord(paths: Paths, name: string): RunRecord | null {
  const file = runFile(paths, name);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as RunRecord;
  } catch {
    return null;
  }
}

function clearRunRecord(paths: Paths, name: string): void {
  rmSync(runFile(paths, name), { force: true });
}

async function checkHealth(service: ServiceDefinition, pgid: number): Promise<boolean> {
  const check = service.healthcheck;
  if (check.type === "process") return groupAlive(pgid);
  if (check.type === "tcp") return isPortOpen(check.port);
  try {
    const response = await fetch(check.url, { signal: AbortSignal.timeout(1_500), redirect: "manual" });
    await response.body?.cancel();
    return response.status < 500;
  } catch {
    return false;
  }
}

export class Supervisor {
  private config: ServicesConfig;
  private readonly paths: Paths;
  private readonly stopping = new Set<string>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(config: ServicesConfig, paths: Paths) {
    this.config = config;
    this.paths = paths;
  }

  reload(config: ServicesConfig): void {
    this.config = config;
  }

  /** One action at a time per service, so concurrent requests cannot double-start. */
  private serial<T>(name: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      name,
      next.catch(() => undefined),
    );
    return next;
  }

  async statusOf(service: ServiceDefinition): Promise<ServiceStatus> {
    const base: ServiceStatus = {
      name: service.name,
      description: service.description,
      state: "stopped",
      pid: null,
      port: service.port,
      startedAt: null,
      uptimeMs: null,
      healthy: null,
      exitCode: null,
      detail: null,
      autostart: service.autostart,
    };
    const record = readRunRecord(this.paths, service.name);
    if (!record) return base;

    if (record.state === "exited") {
      return {
        ...base,
        state: "crashed",
        exitCode: record.exitCode ?? null,
        detail: record.error ?? `exited with ${record.signal ? `signal ${record.signal}` : `code ${record.exitCode ?? "?"}`}`,
      };
    }

    const owned = ownership(record);
    if (owned === "reused" || owned === "gone") {
      // The runner vanished without recording an exit (killed hard, machine
      // rebooted) or its PID now belongs to something else: a stale record.
      clearRunRecord(this.paths, service.name);
      return { ...base, detail: owned === "reused" ? "stale record cleared (PID reused)" : "stale record cleared" };
    }

    const startedAt = record.startedAt;
    const uptimeMs = Date.now() - new Date(startedAt).getTime();
    const running = { ...base, pid: record.pid, startedAt, uptimeMs };
    if (this.stopping.has(service.name)) return { ...running, state: "stopping" };
    if (owned === "orphaned-group") return { ...running, state: "unhealthy", detail: "runner exited; leftover processes remain" };

    const healthy = await checkHealth(service, record.pid);
    if (healthy) return { ...running, state: "running", healthy };
    return { ...running, state: uptimeMs < START_GRACE_MS ? "starting" : "unhealthy", healthy };
  }

  async status(): Promise<ServiceStatus[]> {
    return Promise.all(this.config.services.map((service) => this.statusOf(service)));
  }

  start(name: string): Promise<ActionResult> {
    const service = requireService(this.config, name);
    return this.serial(name, () => this.startUnlocked(service, new Set()));
  }

  private async startUnlocked(service: ServiceDefinition, chain: Set<string>): Promise<ActionResult> {
    const name = service.name;
    const current = await this.statusOf(service);
    if (current.state === "running" || current.state === "starting" || current.state === "stopping") {
      return { ok: true, name, message: `${name} is already ${current.state}`, unchanged: true };
    }
    if (current.state === "unhealthy") {
      return { ok: false, name, message: `${name} is running but unhealthy; restart it instead` };
    }

    for (const dependency of service.dependsOn) {
      if (chain.has(dependency)) continue;
      const dependencyService = requireService(this.config, dependency);
      const started = await this.serial(dependency, () => this.startUnlocked(dependencyService, new Set([...chain, name])));
      if (!started.ok) return { ok: false, name, message: `cannot start ${name}: ${started.message}` };
      const healthy = await this.waitHealthy(dependencyService, DEPENDENCY_WAIT_MS);
      if (!healthy) return { ok: false, name, message: `cannot start ${name}: ${dependency} did not become healthy` };
    }

    if (service.port !== null && (await isPortOpen(service.port))) {
      const holder = await portHolder(service.port);
      const who = holder?.pid ? `${holder.command ?? "a process"} (pid ${holder.pid})` : "another user's process (for example a container)";
      return { ok: false, name, message: `port ${service.port} is already in use by ${who}; ${name} was not started` };
    }

    clearRunRecord(this.paths, name);
    const runner = spawn(
      process.execPath,
      [...process.execArgv, CLI_ENTRY, "run", name, "--config", this.config.file, "--home", this.paths.home],
      { cwd: service.cwd, detached: true, stdio: "ignore", env: process.env },
    );
    runner.unref();
    const pid = runner.pid;
    if (!pid) return { ok: false, name, message: `could not launch the runner for ${name}` };
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const record = readRunRecord(this.paths, name);
      if (record && record.pid === pid) return { ok: true, name, message: `${name} started (pid ${pid})` };
      await sleep(25);
    }
    return { ok: false, name, message: `${name} did not report in after starting` };
  }

  private async waitHealthy(service: ServiceDefinition, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.statusOf(service);
      if (status.state === "running") return true;
      if (status.state === "crashed" || status.state === "stopped") return false;
      await sleep(250);
    }
    return false;
  }

  stop(name: string): Promise<ActionResult> {
    const service = requireService(this.config, name);
    return this.serial(name, () => this.stopUnlocked(service));
  }

  private async stopUnlocked(service: ServiceDefinition): Promise<ActionResult> {
    const name = service.name;
    const record = readRunRecord(this.paths, name);
    if (!record) return { ok: true, name, message: `${name} is already stopped`, unchanged: true };
    if (record.state === "exited") {
      clearRunRecord(this.paths, name);
      return { ok: true, name, message: `${name} had already exited`, unchanged: true };
    }
    const owned = ownership(record);
    if (owned === "reused" || owned === "gone") {
      clearRunRecord(this.paths, name);
      return { ok: true, name, message: `${name} was not running (stale record cleared)`, unchanged: true };
    }

    this.stopping.add(name);
    try {
      signalGroup(record, service.stopSignal);
      let exited = await waitForGroupExit(record.pid, service.stopTimeoutMs);
      if (!exited) {
        signalGroup(record, "SIGKILL");
        exited = await waitForGroupExit(record.pid, 2_000);
      }
      if (!exited) return { ok: false, name, message: `${name} did not stop` };
      clearRunRecord(this.paths, name);
      return { ok: true, name, message: `${name} stopped` };
    } finally {
      this.stopping.delete(name);
    }
  }

  restart(name: string): Promise<ActionResult> {
    const service = requireService(this.config, name);
    return this.serial(name, async () => {
      const stopped = await this.stopUnlocked(service);
      if (!stopped.ok) return stopped;
      return this.startUnlocked(service, new Set());
    });
  }

  async stopAll(): Promise<ActionResult[]> {
    // Dependents first: reverse of the order they would start in.
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const dependency of requireService(this.config, name).dependsOn) visit(dependency);
      order.push(name);
    };
    for (const service of this.config.services) visit(service.name);
    const results: ActionResult[] = [];
    for (const name of order.reverse()) results.push(await this.stop(name));
    return results;
  }

  async autostart(): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const service of this.config.services.filter((candidate) => candidate.autostart)) {
      results.push(await this.start(service.name));
    }
    return results;
  }

  /** Whether a PID belongs to one of this supervisor's service groups. */
  ownsPid(pid: number): string | null {
    const group = procGroup(pid);
    if (group === null) return null;
    for (const service of this.config.services) {
      const record = readRunRecord(this.paths, service.name);
      if (record?.state === "running" && record.pid === group) return service.name;
    }
    return null;
  }
}

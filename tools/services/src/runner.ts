// The runner: one per running service, started detached so it leads its own
// process group. It starts the service's command in that group and writes the
// command's output, redacted, to a size-capped log. Because the runner (not
// the supervisor) owns the service, services and their logs keep going when
// the supervisor or Claude Code exits.
import { spawn } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";
import { readEnvFile, requireService, type ServicesConfig } from "./config.ts";
import { RotatingLog } from "./logfile.ts";
import { logFile, runFile, type Paths } from "./paths.ts";
import { procStartTime } from "./proc.ts";
import { LineRedactor, Redactor } from "./redact.ts";

export interface RunRecord {
  name: string;
  pid: number;
  startTime: string;
  startedAt: string;
  state: "running" | "exited";
  exitCode?: number | null;
  signal?: string | null;
  endedAt?: string;
  error?: string;
}

export function writeRunRecord(paths: Paths, record: RunRecord): void {
  const target = runFile(paths, record.name);
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
  renameSync(temporary, target);
}

export async function runService(config: ServicesConfig, paths: Paths, name: string): Promise<number> {
  const service = requireService(config, name);
  const envValues = readEnvFile(service.envFile);
  const redactor = new Redactor(envValues);
  const log = new RotatingLog(logFile(paths, name), config.logs.maxBytes, config.logs.keep);
  const stamp = () => new Date().toISOString();
  const out = new LineRedactor(redactor, (line) => log.write(line));
  const record: RunRecord = {
    name,
    pid: process.pid,
    startTime: procStartTime(process.pid) ?? "",
    startedAt: stamp(),
    state: "running",
  };
  writeRunRecord(paths, record);
  log.write(`--- ${stamp()} starting ${name}: ${service.command} ${service.args.join(" ")}\n`);

  // The stop signal goes to the whole group; the runner outlives its child so
  // the last lines and the exit status are recorded.
  process.on("SIGTERM", () => {});
  process.on("SIGINT", () => {});
  process.on("SIGHUP", () => {});

  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...envValues, ...service.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => out.push(chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => out.push(chunk));

  const result = await new Promise<{ code: number | null; signal: string | null; error?: string }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null, error: error.message }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  out.flush();
  log.write(
    `--- ${stamp()} ${name} exited${result.error ? `: ${redactor.line(result.error)}` : ""} (code ${result.code ?? "-"}, signal ${result.signal ?? "-"})\n`,
  );
  log.close();
  writeRunRecord(paths, {
    ...record,
    state: "exited",
    exitCode: result.code,
    signal: result.signal,
    endedAt: stamp(),
    ...(result.error ? { error: redactor.line(result.error) } : {}),
  });
  return result.code ?? 1;
}

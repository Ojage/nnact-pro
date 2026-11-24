// Loads and validates services.json. This file is the allowlist: nothing the
// supervisor runs comes from anywhere else, and nothing is run through a shell.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const SERVICE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const;
export type StopSignal = (typeof STOP_SIGNALS)[number];

export type Healthcheck =
  | { type: "http"; url: string }
  | { type: "tcp"; port: number }
  | { type: "process" };

export interface ServiceDefinition {
  name: string;
  description: string;
  /** Absolute, resolved, and inside the repository root. */
  cwd: string;
  command: string;
  args: string[];
  port: number | null;
  healthcheck: Healthcheck;
  /** Absolute path of a KEY=VALUE file whose values are passed in and redacted from logs. */
  envFile: string | null;
  env: Record<string, string>;
  autostart: boolean;
  dependsOn: string[];
  stopSignal: StopSignal;
  stopTimeoutMs: number;
}

export interface ServicesConfig {
  /** The file this came from. */
  file: string;
  /** Absolute repository root every relative path resolves against. */
  root: string;
  logs: { maxBytes: number; keep: number };
  services: ServiceDefinition[];
}

export class ConfigError extends Error {}

function fail(message: string): never {
  throw new ConfigError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function insideRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function stringList(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) fail(`${where} must be a list of strings`);
  return value as string[];
}

function port(value: unknown, where: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 65_535) fail(`${where} must be a port number`);
  return value as number;
}

function healthcheck(value: unknown, servicePort: number | null, where: string): Healthcheck {
  if (value === undefined) return servicePort ? { type: "tcp", port: servicePort } : { type: "process" };
  if (!isRecord(value)) fail(`${where} must be an object`);
  if (value.type === "process") return { type: "process" };
  if (value.type === "tcp") {
    const checked = port(value.port ?? servicePort, `${where}.port`);
    if (!checked) fail(`${where}.port is required for a tcp check`);
    return { type: "tcp", port: checked };
  }
  if (value.type === "http") {
    if (typeof value.url !== "string") fail(`${where}.url is required for an http check`);
    const url = new URL(value.url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) fail(`${where}.url must point at this machine`);
    return { type: "http", url: url.toString() };
  }
  fail(`${where}.type must be http, tcp or process`);
}

export function parseConfig(raw: unknown, file: string): ServicesConfig {
  if (!isRecord(raw)) fail("services.json must hold an object");
  const base = dirname(file);
  const root = realpathSync(resolve(base, typeof raw.root === "string" ? raw.root : "."));
  const logs = isRecord(raw.logs) ? raw.logs : {};
  const maxBytes = Number(logs.maxBytes ?? 5 * 1024 * 1024);
  const keep = Number(logs.keep ?? 3);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024) fail("logs.maxBytes must be at least 1024");
  if (!Number.isInteger(keep) || keep < 1 || keep > 20) fail("logs.keep must be between 1 and 20");
  if (!Array.isArray(raw.services)) fail("services must be a list");

  const seen = new Set<string>();
  const services = raw.services.map((entry, index): ServiceDefinition => {
    const where = `services[${index}]`;
    if (!isRecord(entry)) fail(`${where} must be an object`);
    const name = entry.name;
    if (typeof name !== "string" || !SERVICE_NAME.test(name)) fail(`${where}.name must match ${SERVICE_NAME}`);
    if (seen.has(name)) fail(`service ${name} is defined twice`);
    seen.add(name);
    if (typeof entry.command !== "string" || entry.command.trim() === "" || /\s/.test(entry.command)) {
      fail(`${name}.command must be one executable name with no spaces; put arguments in args`);
    }
    const cwdPath = resolve(root, typeof entry.cwd === "string" ? entry.cwd : ".");
    if (!existsSync(cwdPath)) fail(`${name}.cwd does not exist: ${cwdPath}`);
    const cwd = realpathSync(cwdPath);
    if (!insideRoot(root, cwd)) fail(`${name}.cwd must stay inside the repository`);
    let envFile: string | null = null;
    if (entry.envFile !== undefined && entry.envFile !== null) {
      if (typeof entry.envFile !== "string") fail(`${name}.envFile must be a path`);
      envFile = resolve(root, entry.envFile);
      if (!insideRoot(root, envFile)) fail(`${name}.envFile must stay inside the repository`);
    }
    const env: Record<string, string> = {};
    if (entry.env !== undefined) {
      if (!isRecord(entry.env)) fail(`${name}.env must be an object of strings`);
      for (const [key, value] of Object.entries(entry.env)) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof value !== "string") fail(`${name}.env.${key} must be a string`);
        env[key] = value;
      }
    }
    const servicePort = port(entry.port, `${name}.port`);
    const stopSignal = (entry.stopSignal ?? "SIGTERM") as StopSignal;
    if (!STOP_SIGNALS.includes(stopSignal)) fail(`${name}.stopSignal must be SIGTERM or SIGINT`);
    const stopTimeoutMs = Number(entry.stopTimeoutMs ?? 10_000);
    if (!Number.isInteger(stopTimeoutMs) || stopTimeoutMs < 100 || stopTimeoutMs > 120_000) fail(`${name}.stopTimeoutMs is out of range`);
    return {
      name,
      description: typeof entry.description === "string" ? entry.description : "",
      cwd,
      command: entry.command,
      args: stringList(entry.args, `${name}.args`),
      port: servicePort,
      healthcheck: healthcheck(entry.healthcheck, servicePort, `${name}.healthcheck`),
      envFile,
      env,
      autostart: entry.autostart === true,
      dependsOn: stringList(entry.dependsOn, `${name}.dependsOn`),
      stopSignal,
      stopTimeoutMs,
    };
  });

  for (const service of services) {
    for (const dependency of service.dependsOn) {
      if (!seen.has(dependency)) fail(`${service.name} depends on unknown service ${dependency}`);
    }
  }
  // Reject cycles so a start can never recurse forever.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const byName = new Map(services.map((service) => [service.name, service]));
  const visit = (name: string, path: string[]) => {
    if (done.has(name)) return;
    if (visiting.has(name)) fail(`dependency cycle: ${[...path, name].join(" -> ")}`);
    visiting.add(name);
    for (const next of byName.get(name)!.dependsOn) visit(next, [...path, name]);
    visiting.delete(name);
    done.add(name);
  };
  for (const service of services) visit(service.name, []);

  return { file, root, logs: { maxBytes, keep }, services };
}

export function loadConfig(file: string): ServicesConfig {
  const absolute = resolve(file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    fail(`cannot read ${absolute}: ${(error as Error).message}`);
  }
  return parseConfig(raw, absolute);
}

/** The allowlist check every entry point goes through. */
export function requireService(config: ServicesConfig, name: unknown): ServiceDefinition {
  if (typeof name !== "string" || !SERVICE_NAME.test(name)) throw new ConfigError("not a service name");
  const service = config.services.find((candidate) => candidate.name === name);
  if (!service) throw new ConfigError(`unknown service: ${name}`);
  return service;
}

/** Parse a KEY=VALUE file. Values are never logged or printed. */
export function readEnvFile(path: string | null): Record<string, string> {
  if (!path || !existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    values[match[1]] = value;
  }
  return values;
}

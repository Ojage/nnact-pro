// nnact services: start, stop and watch NNACT Pro's local services.
//
//   services status [--json]          every service, its state, port and uptime
//   services start|stop|restart NAME  one service (dependencies start first)
//   services stop-all                 every service; the supervisor stays up
//   services shutdown                 every service, then the supervisor
//   services logs NAME [-n 200] [-f]  the service's (redacted) log
//   services watch                    status, refreshed every 2 seconds
//   services ensure [--quiet]         start the supervisor if it is not running
//
// Services keep running when Claude Code or this command exits.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { ConfigError, loadConfig, requireService, type ServicesConfig } from "./config.ts";
import { ensureDaemon, request } from "./client.ts";
import { runDaemon } from "./daemon.ts";
import { DEFAULT_CONFIG, defaultHome, logFile, pathsFor, type Paths } from "./paths.ts";
import { sleep } from "./proc.ts";
import { runService } from "./runner.ts";
import type { ActionResult, ServiceState, ServiceStatus } from "./supervisor.ts";

const LAMP: Record<ServiceState, string> = {
  running: "● running",
  starting: "◐ starting",
  unhealthy: "▲ unhealthy",
  crashed: "✕ crashed",
  stopped: "○ stopped",
  stopping: "◌ stopping",
};

interface Args {
  command: string;
  name: string | null;
  json: boolean;
  quiet: boolean;
  follow: boolean;
  lines: number;
  config: string;
  home: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { command: "status", name: null, json: false, quiet: false, follow: false, lines: 200, config: DEFAULT_CONFIG, home: null };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") args.json = true;
    else if (value === "--quiet" || value === "-q") args.quiet = true;
    else if (value === "-f" || value === "--follow") args.follow = true;
    else if (value === "-n" || value === "--lines") args.lines = Math.max(1, Math.min(10_000, Number(argv[++index]) || 200));
    else if (value === "--config") args.config = argv[++index] ?? args.config;
    else if (value === "--home") args.home = argv[++index] ?? null;
    else if (value === "-h" || value === "--help") positional.unshift("help");
    else positional.push(value);
  }
  if (positional[0]) args.command = positional[0];
  args.name = positional[1] ?? null;
  return args;
}

function formatUptime(ms: number | null): string {
  if (ms === null) return "-";
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h${minutes % 60}m` : `${Math.floor(hours / 24)}d`;
}

export function formatTable(services: ServiceStatus[]): string {
  const rows = [
    ["SERVICE", "STATE", "PID", "PORT", "UPTIME", "DETAIL"],
    ...services.map((service) => [
      service.name,
      LAMP[service.state],
      service.pid ? String(service.pid) : "-",
      service.port ? String(service.port) : "-",
      formatUptime(service.uptimeMs),
      service.detail ?? "",
    ]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => [...row[column]].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()).join("\n");
}

function tailLines(path: string, count: number): string {
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.slice(-count).join("\n");
}

async function follow(path: string): Promise<never> {
  let offset = existsSync(path) ? statSync(path).size : 0;
  let inode = existsSync(path) ? statSync(path).ino : 0;
  for (;;) {
    await sleep(500);
    if (!existsSync(path)) continue;
    const stat = statSync(path);
    if (stat.ino !== inode || stat.size < offset) {
      inode = stat.ino;
      offset = 0;
    }
    if (stat.size > offset) {
      const fd = openSync(path, "r");
      const buffer = Buffer.alloc(stat.size - offset);
      readSync(fd, buffer, 0, buffer.length, offset);
      closeSync(fd);
      process.stdout.write(buffer);
      offset = stat.size;
    }
  }
}

async function call<T>(config: ServicesConfig, paths: Paths, body: object): Promise<T> {
  if (!(await ensureDaemon(config.file, paths))) throw new Error("the supervisor could not be started; see .services/logs/supervisor.log");
  return request<T>(paths.socket, body);
}

function printResult(result: ActionResult | { ok: boolean; message?: string }, json: boolean): number {
  if (json) console.log(JSON.stringify(result));
  else console.log("message" in result && result.message ? result.message : result.ok ? "done" : "failed");
  return result.ok ? 0 : 1;
}

const HELP = `usage: services <status|start|stop|restart|logs|watch|stop-all|shutdown|ensure|list> [name] [--json] [-f] [-n lines]`;

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === "help") {
    console.log(HELP);
    return 0;
  }

  // The hook path must never fail or block a session: it reports and exits 0.
  if (args.command === "ensure") {
    try {
      const config = loadConfig(args.config);
      const paths = pathsFor(args.home ?? defaultHome(config.root));
      const up = await ensureDaemon(config.file, paths);
      if (!args.quiet) console.log(up ? "services supervisor is running" : "services supervisor did not start");
    } catch (error) {
      if (!args.quiet) console.log(`services: ${(error as Error).message}`);
    }
    return 0;
  }

  const config = loadConfig(args.config);
  const paths = pathsFor(args.home ?? defaultHome(config.root));

  switch (args.command) {
    case "daemon":
      // A supervisor that lost the race exits; the winner stays on its socket.
      if (!(await runDaemon(config.file, paths))) process.exit(0);
      return 0;
    case "run":
      return runService(config, paths, String(args.name));
    case "list":
      for (const service of config.services) {
        console.log(`${service.name.padEnd(12)} ${service.port ?? "-"}\t${service.description}`);
      }
      return 0;
    case "status": {
      const answer = await call<{ ok: boolean; services?: ServiceStatus[]; message?: string }>(config, paths, { op: "status" });
      if (!answer.ok || !answer.services) return printResult(answer, args.json);
      console.log(args.json ? JSON.stringify(answer.services) : formatTable(answer.services));
      return 0;
    }
    case "watch":
      for (;;) {
        const answer = await call<{ services?: ServiceStatus[] }>(config, paths, { op: "status" });
        process.stdout.write(`\x1b[2J\x1b[H${formatTable(answer.services ?? [])}\n\n(ctrl+c to quit; services keep running)\n`);
        await sleep(2_000);
      }
    case "start":
    case "stop":
    case "restart": {
      requireService(config, args.name);
      return printResult(await call<ActionResult>(config, paths, { op: args.command, name: args.name }), args.json);
    }
    case "stop-all":
    case "shutdown": {
      const answer = await call<{ ok: boolean; results?: ActionResult[]; message?: string }>(config, paths, { op: args.command });
      if (args.json) console.log(JSON.stringify(answer));
      else for (const result of answer.results ?? []) console.log(result.message);
      return answer.ok && (answer.results ?? []).every((result) => result.ok) ? 0 : 1;
    }
    case "logs": {
      const service = requireService(config, args.name);
      const path = logFile(paths, service.name);
      const text = tailLines(path, args.lines);
      if (text) console.log(text);
      else if (!args.follow) console.log(`no log yet for ${service.name}`);
      if (args.follow) await follow(path);
      return 0;
    }
    default:
      console.error(HELP);
      return 2;
  }
}

const invoked = parseArgs(process.argv.slice(2)).command;
main(process.argv.slice(2)).then(
  (code) => {
    // The daemon stays alive on its socket; everything else exits with its code.
    if (invoked !== "daemon") process.exit(code);
  },
  (error: unknown) => {
    console.error(`services: ${(error as Error).message}`);
    process.exit(error instanceof ConfigError ? 2 : 1);
  },
);

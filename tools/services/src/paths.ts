// Where the supervisor keeps its runtime files. Everything lives in one
// user-only folder (0700) that git ignores.
import { chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_CONFIG = join(TOOL_DIR, "services.json");
export const CLI_ENTRY = join(TOOL_DIR, "src", "cli.ts");

export interface Paths {
  home: string;
  run: string;
  state: string;
  logs: string;
  socket: string;
  lock: string;
  daemonLog: string;
}

export function pathsFor(home: string): Paths {
  return {
    home,
    run: join(home, "run"),
    state: join(home, "state"),
    logs: join(home, "logs"),
    socket: join(home, "run", "supervisor.sock"),
    lock: join(home, "run", "supervisor.lock"),
    daemonLog: join(home, "logs", "supervisor.log"),
  };
}

/** `NNACT_SERVICES_HOME` overrides the location (tests use a temp folder). */
export function defaultHome(root: string): string {
  return resolve(process.env.NNACT_SERVICES_HOME ?? join(root, ".services"));
}

export function ensureDirs(paths: Paths): void {
  for (const dir of [paths.home, paths.run, paths.state, paths.logs]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
}

export function runFile(paths: Paths, name: string): string {
  return join(paths.state, `${name}.json`);
}

export function logFile(paths: Paths, name: string): string {
  return join(paths.logs, `${name}.log`);
}

// The supervisor daemon: one per repository, controlled over a unix socket
// that only the owner can open. There is no TCP listener. Requests name an
// operation and, where needed, a service from services.json; nothing else is
// accepted, and nothing from a request is ever run.
import { appendFileSync, chmodSync, closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { ConfigError, loadConfig } from "./config.ts";
import { ensureDirs, type Paths } from "./paths.ts";
import { ownership, procStartTime } from "./proc.ts";
import { Supervisor } from "./supervisor.ts";
import { ping } from "./client.ts";

export const OPS = ["ping", "status", "start", "stop", "restart", "stop-all", "shutdown"] as const;
export type Op = (typeof OPS)[number];
const MAX_REQUEST_BYTES = 4_096;

interface LockRecord {
  pid: number;
  startTime: string;
}

function readLock(path: string): LockRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as LockRecord;
    return Number.isInteger(parsed.pid) && typeof parsed.startTime === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Take the lock with an exclusive create. A lock whose holder is gone (or
 * whose PID was reused) is stale and is replaced once.
 */
export function acquireLock(path: string): boolean {
  const mine: LockRecord = { pid: process.pid, startTime: procStartTime(process.pid) ?? "" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeSync(fd, JSON.stringify(mine));
      closeSync(fd);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = readLock(path);
      if (holder && ownership(holder) === "ours") return false;
      // Unreadable (being written right now) counts as held on the first try.
      if (!holder && attempt === 0) return false;
      rmSync(path, { force: true });
    }
  }
  return false;
}

function holdsLock(path: string): boolean {
  return readLock(path)?.pid === process.pid;
}

/** Resolves true once serving, false when another supervisor already is. */
export async function runDaemon(configFile: string, paths: Paths): Promise<boolean> {
  process.umask(0o077);
  ensureDirs(paths);
  const log = (line: string) => appendFileSync(paths.daemonLog, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });

  if (await ping(paths.socket)) return false;
  if (!acquireLock(paths.lock)) return false;

  const supervisor = new Supervisor(loadConfig(configFile), paths);
  rmSync(paths.socket, { force: true });

  const handle = async (raw: string): Promise<unknown> => {
    let request: { op?: unknown; name?: unknown };
    try {
      request = JSON.parse(raw);
    } catch {
      return { ok: false, message: "bad request" };
    }
    const op = request.op;
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) return { ok: false, message: "unknown operation" };
    try {
      // Pick up edits to services.json without a restart.
      supervisor.reload(loadConfig(configFile));
      switch (op as Op) {
        case "ping":
          return { ok: true, pid: process.pid };
        case "status":
          return { ok: true, services: await supervisor.status() };
        case "start":
          return supervisor.start(String(request.name));
        case "stop":
          return supervisor.stop(String(request.name));
        case "restart":
          return supervisor.restart(String(request.name));
        case "stop-all":
          return { ok: true, results: await supervisor.stopAll() };
        case "shutdown": {
          const results = await supervisor.stopAll();
          setTimeout(() => shutdown("shutdown requested"), 50);
          return { ok: true, results };
        }
      }
    } catch (error) {
      if (error instanceof ConfigError) return { ok: false, message: error.message };
      log(`error handling ${op}: ${(error as Error).message}`);
      return { ok: false, message: "internal error" };
    }
  };

  const server = createServer((socket: Socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(120_000, () => socket.destroy());
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_BYTES) {
        socket.end(JSON.stringify({ ok: false, message: "request too large" }) + "\n");
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = "";
      void handle(line).then((response) => socket.end(JSON.stringify(response) + "\n"));
    });
    socket.on("error", () => socket.destroy());
  });

  const shutdown = (reason: string) => {
    log(`supervisor ${process.pid} stopping (${reason}); services keep running`);
    server.close();
    rmSync(paths.socket, { force: true });
    if (holdsLock(paths.lock)) rmSync(paths.lock, { force: true });
    process.exit(0);
  };

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.socket, () => resolve());
  });
  chmodSync(paths.socket, 0o600);
  log(`supervisor ${process.pid} listening`);

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGHUP", () => {});
  // If another supervisor took the lock over (ours looked stale), step aside.
  setInterval(() => {
    if (!holdsLock(paths.lock)) shutdown("lock lost");
  }, 10_000).unref();

  for (const result of await supervisor.autostart()) log(`autostart ${result.name}: ${result.message}`);
  return true;
}

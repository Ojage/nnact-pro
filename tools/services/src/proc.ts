// Process ownership on Linux. A PID alone is never trusted: every record
// carries the kernel's start time for that PID, so a reused PID is told apart
// from the process the supervisor started.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { connect } from "node:net";

/** Field 22 of /proc/<pid>/stat (start time in clock ticks), or null if gone. */
export function procStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // The command name (field 2) may hold spaces and parentheses; split after it.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/** Field 5 of /proc/<pid>/stat: the process group. */
export function procGroup(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return Number(fields[2]);
  } catch {
    return null;
  }
}

export function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface OwnedProcess {
  pid: number;
  startTime: string;
}

export type Ownership = "ours" | "orphaned-group" | "gone" | "reused";

/**
 * - ours: the leader is alive with the recorded start time
 * - orphaned-group: the leader exited but members of its group remain (a
 *   group id cannot be handed out again while the group has members)
 * - reused: a different process now has that PID; it is not ours
 * - gone: nothing of it is left
 */
export function ownership(record: OwnedProcess): Ownership {
  const current = procStartTime(record.pid);
  if (current !== null) return current === record.startTime ? "ours" : "reused";
  return groupAlive(record.pid) ? "orphaned-group" : "gone";
}

/** Signal a whole process group the supervisor started. Never anything else. */
export function signalGroup(record: OwnedProcess, signal: NodeJS.Signals): boolean {
  const owned = ownership(record);
  if (owned !== "ours" && owned !== "orphaned-group") return false;
  try {
    process.kill(-record.pid, signal);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the group is gone, up to `timeoutMs`. */
export async function waitForGroupExit(pgid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return true;
    await sleep(50);
  }
  return !groupAlive(pgid);
}

export function isPortOpen(port: number, host = "127.0.0.1", timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export interface PortHolder {
  pid: number | null;
  command: string | null;
}

/** Who listens on a TCP port, from `ss`. The PID is hidden for other users' processes. */
export function portHolder(port: number): Promise<PortHolder | null> {
  return new Promise((resolve) => {
    execFile("ss", ["-H", "-ltnp", `sport = :${port}`], { timeout: 2_000 }, (error, stdout) => {
      if (error || !stdout.trim()) return resolve(null);
      const match = /users:\(\("([^"]*)",pid=(\d+)/.exec(stdout);
      resolve(match ? { command: match[1], pid: Number(match[2]) } : { command: null, pid: null });
    });
  });
}

// Talks to the supervisor over its unix socket, starting it when needed.
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { CLI_ENTRY, ensureDirs, type Paths } from "./paths.ts";
import { sleep } from "./proc.ts";

export function request<T = Record<string, unknown>>(socketPath: string, body: object, timeoutMs = 120_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error("the supervisor did not answer in time"));
    });
    socket.once("connect", () => socket.write(JSON.stringify(body) + "\n"));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
    });
    socket.once("end", () => {
      try {
        resolve(JSON.parse(buffer) as T);
      } catch {
        reject(new Error("the supervisor sent an unreadable answer"));
      }
    });
    socket.once("error", reject);
  });
}

export async function ping(socketPath: string): Promise<boolean> {
  try {
    const answer = await request<{ ok?: boolean }>(socketPath, { op: "ping" }, 1_000);
    return answer.ok === true;
  } catch {
    return false;
  }
}

/**
 * Make sure a supervisor is running. Safe to call from many sessions at once:
 * every caller may launch one, but only the first to take the lock stays.
 */
export async function ensureDaemon(configFile: string, paths: Paths, waitMs = 5_000): Promise<boolean> {
  if (await ping(paths.socket)) return true;
  ensureDirs(paths);
  const daemon = spawn(process.execPath, [...process.execArgv, CLI_ENTRY, "daemon", "--config", configFile, "--home", paths.home], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  daemon.unref();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(100);
    if (await ping(paths.socket)) return true;
  }
  return false;
}

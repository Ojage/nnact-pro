import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type ServicesConfig } from "../src/config.ts";
import { pathsFor, type Paths } from "../src/paths.ts";

export const FIXTURE_SERVICE = resolve(fileURLToPath(new URL("./fixtures/service.mjs", import.meta.url)));

export function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(typeof address === "object" && address ? address.port : 0));
    });
  });
}

export interface Fixture {
  dir: string;
  config: ServicesConfig;
  paths: Paths;
  port: number;
  grandchildFile: string;
}

/** A temp repository with one service ("svc") built on the fixture script. */
export async function makeFixture(extraEnv: Record<string, string> = {}): Promise<Fixture> {
  const dir = mkdtempSync(join(tmpdir(), "nnact-services-"));
  const port = await freePort();
  const grandchildFile = join(dir, "grandchild.pid");
  writeFileSync(join(dir, ".env"), "SECRET_TOKEN=s3cr3t-token-value-9f2\nPLAIN_FLAG=true\n");
  writeFileSync(
    join(dir, "services.json"),
    JSON.stringify({
      root: ".",
      logs: { maxBytes: 4096, keep: 2 },
      services: [
        {
          name: "svc",
          cwd: ".",
          command: process.execPath,
          args: [FIXTURE_SERVICE],
          port,
          envFile: ".env",
          env: { PORT: String(port), GRANDCHILD_FILE: grandchildFile, ...extraEnv },
          stopTimeoutMs: 800,
        },
      ],
    }),
  );
  const config = loadConfig(join(dir, "services.json"));
  return { dir, config, paths: pathsFor(join(dir, ".services")), port, grandchildFile };
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((done) => setTimeout(done, 50));
  }
  return false;
}

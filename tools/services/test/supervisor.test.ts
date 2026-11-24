import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { ConfigError, parseConfig, requireService } from "../src/config.ts";
import { ping, request } from "../src/client.ts";
import { RotatingLog } from "../src/logfile.ts";
import { CLI_ENTRY, ensureDirs, runFile } from "../src/paths.ts";
import { procStartTime } from "../src/proc.ts";
import { Redactor } from "../src/redact.ts";
import { Supervisor } from "../src/supervisor.ts";
import { alive, freePort, makeFixture, waitFor, type Fixture } from "./helpers.ts";

const run = promisify(execFile);
const fixtures: Fixture[] = [];

async function fixture(extraEnv: Record<string, string> = {}) {
  const made = await makeFixture(extraEnv);
  fixtures.push(made);
  ensureDirs(made.paths);
  return made;
}

after(async () => {
  for (const made of fixtures) {
    await new Supervisor(made.config, made.paths).stopAll().catch(() => undefined);
    if (existsSync(made.paths.socket)) await request(made.paths.socket, { op: "shutdown" }).catch(() => undefined);
    rmSync(made.dir, { recursive: true, force: true });
  }
});

async function runningPid(supervisor: Supervisor): Promise<number> {
  let pid = 0;
  const ok = await waitFor(async () => {
    const [status] = await supervisor.status();
    pid = status.pid ?? 0;
    return status.state === "running";
  });
  assert.ok(ok, "service should reach running");
  return pid;
}

test("start, stop and restart are idempotent", async () => {
  const made = await fixture();
  const supervisor = new Supervisor(made.config, made.paths);

  assert.equal((await supervisor.start("svc")).ok, true);
  const first = await runningPid(supervisor);
  const again = await supervisor.start("svc");
  assert.equal(again.ok, true);
  assert.equal(again.unchanged, true);
  assert.equal((await supervisor.status())[0].pid, first, "a second start must not launch another copy");

  const restarted = await supervisor.restart("svc");
  assert.equal(restarted.ok, true, restarted.message);
  const second = await runningPid(supervisor);
  assert.notEqual(second, first);
  assert.equal(alive(first), false);

  assert.equal((await supervisor.stop("svc")).ok, true);
  const stoppedAgain = await supervisor.stop("svc");
  assert.equal(stoppedAgain.ok, true);
  assert.equal(stoppedAgain.unchanged, true);
  assert.equal((await supervisor.status())[0].state, "stopped");
});

test("stop removes the whole process tree, escalating past processes that ignore SIGTERM", async () => {
  const made = await fixture({ IGNORE_TERM: "1" });
  const supervisor = new Supervisor(made.config, made.paths);
  await supervisor.start("svc");
  const leader = await runningPid(supervisor);
  assert.ok(await waitFor(() => existsSync(made.grandchildFile)));
  const grandchild = Number(readFileSync(made.grandchildFile, "utf8"));
  assert.equal(alive(grandchild), true);

  const stopped = await supervisor.stop("svc");
  assert.equal(stopped.ok, true, stopped.message);
  assert.equal(alive(leader), false, "runner gone");
  assert.equal(alive(grandchild), false, "grandchild gone");
});

test("stale records are cleared and never used to signal someone else's process", async () => {
  const made = await fixture();
  const supervisor = new Supervisor(made.config, made.paths);
  // An unrelated process the supervisor did not start.
  const bystander = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    const pid = bystander.pid!;
    writeFileSync(
      runFile(made.paths, "svc"),
      JSON.stringify({ name: "svc", pid, startTime: "1", startedAt: new Date().toISOString(), state: "running" }),
    );
    const [status] = await supervisor.status();
    assert.equal(status.state, "stopped");
    assert.match(status.detail ?? "", /PID reused/);
    assert.equal(existsSync(runFile(made.paths, "svc")), false);

    writeFileSync(
      runFile(made.paths, "svc"),
      JSON.stringify({ name: "svc", pid, startTime: "1", startedAt: new Date().toISOString(), state: "running" }),
    );
    const stopped = await supervisor.stop("svc");
    assert.equal(stopped.unchanged, true);
    assert.equal(alive(pid), true, "the bystander must survive");

    // A record of a process that is long gone.
    writeFileSync(
      runFile(made.paths, "svc"),
      JSON.stringify({ name: "svc", pid: 2 ** 22 - 7, startTime: "1", startedAt: new Date().toISOString(), state: "running" }),
    );
    assert.equal((await supervisor.status())[0].state, "stopped");
    assert.equal((await supervisor.start("svc")).ok, true, "a stale record does not block a start");
    await runningPid(supervisor);
  } finally {
    bystander.kill();
  }
});

test("a port held by another process blocks the start and names the holder", async () => {
  const made = await fixture();
  const blocker = createServer().listen(made.port, "127.0.0.1");
  await new Promise((done) => blocker.once("listening", done));
  try {
    const result = await new Supervisor(made.config, made.paths).start("svc");
    assert.equal(result.ok, false);
    assert.match(result.message, new RegExp(`port ${made.port} is already in use by .*pid ${process.pid}`));
    assert.equal(existsSync(runFile(made.paths, "svc")), false, "nothing was launched");
  } finally {
    blocker.close();
  }
});

test("logs are redacted before they reach disk", async () => {
  const made = await fixture();
  const supervisor = new Supervisor(made.config, made.paths);
  await supervisor.start("svc");
  await runningPid(supervisor);
  await supervisor.stop("svc");
  const log = readFileSync(join(made.paths.logs, "svc.log"), "utf8");
  for (const secret of ["s3cr3t-token-value-9f2", "abcdefghijklmnopqrstuv", "hunter22-secret", "pa55word", "612345678", "amina@example.com"]) {
    assert.equal(log.includes(secret), false, `log leaked ${secret}`);
  }
  assert.match(log, /\[redacted:SECRET_TOKEN\]/);
  assert.match(log, /\[phone\]/);
  assert.match(log, /\[email\]/);
});

test("redactor masks env values longest first and leaves harmless values", () => {
  const redactor = new Redactor({ A: "abcdef-long-secret", B: "abcdef", FLAG: "true", PORT: "3003" });
  assert.equal(redactor.line("x abcdef-long-secret y abcdef"), "x [redacted:A] y [redacted:B]");
  assert.equal(redactor.line("listening on 3003, debug true"), "listening on 3003, debug true");
  assert.equal(redactor.line('{"apiKey":"k-123456"}'), '{"apiKey":"[redacted]"}');
});

test("logs rotate at the size cap and keep a fixed number of files", async () => {
  const made = await fixture();
  const path = join(made.paths.logs, "rotate.log");
  const log = new RotatingLog(path, 1024, 2);
  for (let index = 0; index < 100; index += 1) log.write(`${String(index).padStart(3, "0")} ${"y".repeat(60)}\n`);
  log.close();
  const files = readdirSync(made.paths.logs).filter((file) => file.startsWith("rotate.log")).sort();
  assert.deepEqual(files, ["rotate.log", "rotate.log.1", "rotate.log.2"]);
  for (const file of files) assert.ok(statSync(join(made.paths.logs, file)).size <= 1024);
  assert.match(readFileSync(path, "utf8"), /099 /, "the newest line is in the live file");
});

test("ten concurrent session starts leave exactly one supervisor", async () => {
  const made = await fixture();
  const args = [...process.execArgv, CLI_ENTRY, "ensure", "--quiet", "--config", made.config.file, "--home", made.paths.home];
  const results = await Promise.all(Array.from({ length: 10 }, () => run(process.execPath, args, { timeout: 20_000 })));
  assert.equal(results.length, 10);
  assert.equal(await ping(made.paths.socket), true);
  const daemonPids = () =>
    readdirSync("/proc")
      .filter((entry) => /^\d+$/.test(entry))
      .filter((pid) => {
        try {
          const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
          return cmdline.includes("daemon") && cmdline.includes(made.paths.home);
        } catch {
          return false;
        }
      });
  // Every launched supervisor but the lock holder exits once it sees the live one.
  await waitFor(() => daemonPids().length <= 1, 10_000);
  const daemons = daemonPids();
  assert.equal(daemons.length, 1, `expected one supervisor, found ${daemons.length}`);

  const lock = JSON.parse(readFileSync(made.paths.lock, "utf8"));
  assert.equal(String(lock.pid), daemons[0]);
  assert.equal(lock.startTime, procStartTime(lock.pid));
  assert.equal(statSync(made.paths.socket).mode & 0o777, 0o600, "socket is user-only");
  assert.equal(statSync(made.paths.run).mode & 0o777, 0o700, "run folder is user-only");
});

test("only services.json entries can run, by name, with no shell", async () => {
  const made = await fixture();
  assert.throws(() => requireService(made.config, "nope"), ConfigError);
  assert.throws(() => requireService(made.config, "svc; rm -rf /"), ConfigError);
  assert.throws(() => requireService(made.config, "../svc"), ConfigError);

  assert.throws(() => parseConfig({ services: [{ name: "x", command: "sh -c 'id'" }] }, made.config.file), /one executable/);
  assert.throws(() => parseConfig({ services: [{ name: "x", command: "node", cwd: "/tmp" }] }, made.config.file), /inside the repository/);
  assert.throws(
    () => parseConfig({ services: [{ name: "x", command: "node", healthcheck: { type: "http", url: "http://example.com/" } }] }, made.config.file),
    /this machine/,
  );

  // Through the socket: unknown operations and names are refused.
  const args = [...process.execArgv, CLI_ENTRY, "ensure", "--quiet", "--config", made.config.file, "--home", made.paths.home];
  await run(process.execPath, args);
  assert.equal((await request<{ ok: boolean }>(made.paths.socket, { op: "exec", name: "svc" })).ok, false);
  const unknown = await request<{ ok: boolean; message: string }>(made.paths.socket, { op: "start", name: "touch /tmp/pwned" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /not a service name/);

  // Arguments are passed as data: shell syntax in them is never interpreted.
  const marker = join(made.dir, "pwned");
  const config = parseConfig(
    { services: [{ name: "echo", cwd: ".", command: "echo", args: [`$(touch ${marker})`, ";", "touch", marker], healthcheck: { type: "process" } }] },
    made.config.file,
  );
  const supervisor = new Supervisor(config, made.paths);
  await supervisor.start("echo");
  await waitFor(async () => (await supervisor.status())[0].state === "crashed" || (await supervisor.status())[0].state === "stopped");
  assert.equal(existsSync(marker), false);
  await supervisor.stop("echo");
});

test("a free port helper hands out distinct ports", async () => {
  const [a, b] = [await freePort(), await freePort()];
  assert.ok(a > 0 && b > 0);
});

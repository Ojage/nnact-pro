// Runnable check (no DB/deps): node --import tsx --test test/notify.test.ts
// Stubs global fetch so we exercise the ntfy path without a network call.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { notify } from "../src/notify.ts";

const realFetch = globalThis.fetch;
const realLog = console.log;
const realErr = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realErr;
  delete process.env.NTFY_URL;
});

test("with no NTFY_URL it logs to console and never calls fetch", async () => {
  delete process.env.NTFY_URL;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response();
  }) as typeof fetch;
  const lines: string[] = [];
  console.log = (...a: unknown[]) => lines.push(a.join(" "));

  await notify("Title", "Body");

  assert.equal(fetched, false, "fetch must not be called without NTFY_URL");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Title — Body/);
});

test("with NTFY_URL it POSTs the title as a header and the message as the body", async () => {
  process.env.NTFY_URL = "https://ntfy.example/test";
  let seenUrl: string | undefined;
  let seenInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seenUrl = url;
    seenInit = init;
    return new Response();
  }) as unknown as typeof fetch;

  await notify("Upcoming appointment", "Job at noon");

  assert.equal(seenUrl, "https://ntfy.example/test");
  assert.equal(seenInit?.method, "POST");
  assert.equal((seenInit?.headers as Record<string, string>).Title, "Upcoming appointment");
  assert.equal(seenInit?.body, "Job at noon");
});

test("a failing ntfy POST is swallowed and falls back to console (never throws)", async () => {
  process.env.NTFY_URL = "https://ntfy.example/test";
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const errs: string[] = [];
  const logs: string[] = [];
  console.error = (...a: unknown[]) => errs.push(a.join(" "));
  console.log = (...a: unknown[]) => logs.push(a.join(" "));

  await assert.doesNotReject(notify("T", "M"));

  assert.equal(errs.length, 1);
  assert.match(errs[0], /ntfy failed: network down/);
  assert.equal(logs.length, 1, "must still fall back to the console sink");
  assert.match(logs[0], /T — M/);
});

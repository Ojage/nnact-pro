import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createFixedWindowRateLimit } from "../src/rate-limit.js";
import { applyApiSecurityHeaders } from "../src/security-headers.js";

function fakeReply() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  const reply = {
    header(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    code(value: number) {
      statusCode = value;
      return this;
    },
    send(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, headers, status: () => statusCode, body: () => body };
}

test("fixed-window limiter rejects excess requests and resets", async () => {
  let now = 1_000;
  const limiter = createFixedWindowRateLimit({
    max: 2,
    windowMs: 60_000,
    key: () => "client",
    now: () => now,
  });
  const request = { ip: "127.0.0.1" } as FastifyRequest;

  const first = fakeReply();
  await limiter(request, first.reply);
  assert.equal(first.status(), 200);
  assert.equal(first.headers.get("X-RateLimit-Remaining"), "1");

  const second = fakeReply();
  await limiter(request, second.reply);
  assert.equal(second.status(), 200);
  assert.equal(second.headers.get("X-RateLimit-Remaining"), "0");

  const third = fakeReply();
  await limiter(request, third.reply);
  assert.equal(third.status(), 429);
  assert.equal(third.headers.get("Retry-After"), "60");
  assert.deepEqual(third.body(), { error: "too many requests", retryAfterSeconds: 60 });

  now += 60_001;
  const reset = fakeReply();
  await limiter(request, reset.reply);
  assert.equal(reset.status(), 200);
  assert.equal(reset.headers.get("X-RateLimit-Remaining"), "1");
});

test("API security headers include transport protection only in production", () => {
  const development = fakeReply();
  applyApiSecurityHeaders(development.reply, false);
  assert.equal(development.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(development.headers.get("X-Frame-Options"), "DENY");
  assert.equal(development.headers.has("Strict-Transport-Security"), false);

  const production = fakeReply();
  applyApiSecurityHeaders(production.reply, true);
  assert.equal(
    production.headers.get("Strict-Transport-Security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.match(production.headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
});

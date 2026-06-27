// Runnable check (no DB/deps): node --experimental-strip-types --test test/auth.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/auth.ts";

test("a password verifies against its own hash", async () => {
  const hash = await hashPassword("hunter2-correct-horse");
  assert.equal(await verifyPassword("hunter2-correct-horse", hash), true);
});

test("a wrong password does not verify", async () => {
  const hash = await hashPassword("hunter2-correct-horse");
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("hash is salted: same password hashes differ", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
});

test("malformed stored hash fails closed", async () => {
  assert.equal(await verifyPassword("x", "not-a-valid-hash"), false);
});

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedLine = readFileSync(resolve(root, "pnpm-lock.expected.sha256"), "utf8").trim();
const [expected, fileName] = expectedLine.split(/\s+/, 2);
if (!/^[a-f0-9]{64}$/.test(expected) || fileName !== "pnpm-lock.yaml") {
  throw new Error("pnpm-lock.expected.sha256 is malformed");
}

const actual = createHash("sha256")
  .update(readFileSync(resolve(root, "pnpm-lock.yaml")))
  .digest("hex");

if (actual !== expected) {
  console.error(`Lockfile digest mismatch. Expected ${expected}; received ${actual}.`);
  console.error("Review dependency changes, then update pnpm-lock.yaml and pnpm-lock.expected.sha256 together.");
  process.exit(1);
}

console.log(`Verified pnpm-lock.yaml sha256 ${actual}`);

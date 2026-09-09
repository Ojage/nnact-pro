#!/usr/bin/env node
/**
 * Decides which production images must be rebuilt for a given set of changed
 * paths (or, via the CLI, between two git refs). Pure classifier + thin git
 * wrapper so it can be unit-tested and reused by ci-deploy.sh.
 *
 * CLI:
 *   node scripts/change-detect.mjs <lastSha>
 *     diffs <lastSha>..HEAD (must run inside the repo) and prints:
 *       API=true|false  WEB=...  WORKER=...  MIGRATE=...  ALL=true|false
 *   node scripts/change-detect.mjs            # no sha -> everything rebuilds
 */
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Returns { api, web, worker, migrate } booleans from a changed-file list. */
export function classify(files) {
  const list = Array.isArray(files) ? files : [files];
  const startsWithAny = (...prefixes) => list.some((f) => prefixes.some((p) => f === p || f.startsWith(p)));
  const matches = (re) => list.some((f) => re.test(f));

  const shared = startsWithAny(
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "pnpm-lock.expected.sha256",
    ".dockerignore",
    "patches/",
    "scripts/",
    "infra/",
  ) || matches(/^apps\/[^/]+\/Dockerfile$/);

  const anyPackage = startsWithAny("packages/");

  const api = shared || anyPackage || startsWithAny("apps/api/");
  const web = shared || anyPackage || startsWithAny("apps/web/");
  // The worker imports api source modules directly (../../api/src/...) and is
  // therefore rebuilt whenever apps/api changes, not just apps/worker.
  const worker = shared || anyPackage || startsWithAny("apps/worker/") || startsWithAny("apps/api/");
  const migrate = startsWithAny("packages/db/");

  return { api, web, worker, migrate };
}

function changedSince(lastSha) {
  if (!lastSha) return null;
  const out = execSync(`git diff --name-only ${lastSha}..HEAD`, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

function render(decision) {
  const all = decision.api && decision.web && decision.worker && decision.migrate;
  return [
    `API=${decision.api}`,
    `WEB=${decision.web}`,
    `WORKER=${decision.worker}`,
    `MIGRATE=${decision.migrate}`,
    `ALL=${all}`,
  ].join("\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const lastSha = process.argv[2] ?? "";
  if (lastSha === "--stdin") {
    // Printed by ci-deploy.sh so node does not have to exist on the VPS: the
    // VPS pipes `git diff --name-only` (git is present) into a node container
    // which classifies the lines without needing git itself.
    const input = await new Promise((resolveAll) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { data += chunk; });
      process.stdin.on("end", () => resolveAll(data));
    });
    const files = input.split("\n").map((l) => l.trim()).filter(Boolean);
    process.stdout.write(`${render(classify(files))}\n`);
  } else {
    const files = changedSince(lastSha);
    // No previous deploy marker (or missing ref): force a full rebuild.
    const decision = files === null ? { api: true, web: true, worker: true, migrate: true } : classify(files);
    process.stdout.write(`${render(decision)}\n`);
  }
}

export { changedSince, render };
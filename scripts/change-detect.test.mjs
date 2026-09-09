import assert from "node:assert/strict";
import test from "node:test";
import { classify, render } from "../scripts/change-detect.mjs";

test("touching apps/web only rebuilds web", () => {
  const d = classify(["apps/web/app/settings/page.tsx"]);
  assert.deepEqual(d, { api: false, web: true, worker: false, migrate: false });
});

test("touching apps/api only rebuilds api (and worker, which imports api source)", () => {
  const d = classify(["apps/api/src/routes/sms.ts"]);
  assert.deepEqual(d, { api: true, web: false, worker: true, migrate: false });
});

test("worker consumes api source, so apps/api changes rebuild worker too", () => {
  const d = classify(["apps/api/src/recurrence.ts"]);
  assert.deepEqual(d, { api: true, web: false, worker: true, migrate: false });
});

test("apps/worker changes rebuild only worker", () => {
  const d = classify(["apps/worker/src/index.ts"]);
  assert.deepEqual(d, { api: false, web: false, worker: true, migrate: false });
});

test("touching a shared package rebuilds every image but not migrations", () => {
  const d = classify(["packages/shared/src/api-error.ts"]);
  assert.deepEqual(d, { api: true, web: true, worker: true, migrate: false });
});

test("touching packages/db also runs migrations", () => {
  const d = classify(["packages/db/drizzle/0035_x.sql"]);
  assert.deepEqual(d, { api: true, web: true, worker: true, migrate: true });
});

test("a Dockerfile change rebuilds every image", () => {
  const d = classify(["apps/api/Dockerfile"]);
  assert.deepEqual(d, { api: true, web: true, worker: true, migrate: false });
});

test("infra and lockfile changes rebuild every image", () => {
  assert.deepEqual(classify(["infra/compose.prod.yml"]), { api: true, web: true, worker: true, migrate: false });
  assert.deepEqual(classify(["pnpm-lock.yaml"]), { api: true, web: true, worker: true, migrate: false });
});

test("mobile-only commits do not touch production images", () => {
  const d = classify(["apps/mobile/src/screens/LoginScreen.tsx"]);
  assert.deepEqual(d, { api: false, web: false, worker: false, migrate: false });
});

test("docs-only commits rebuild nothing", () => {
  const d = classify(["README.md"]);
  assert.deepEqual(d, { api: false, web: false, worker: false, migrate: false });
});

test("an empty change list rebuilds nothing", () => {
  const d = classify([]);
  assert.deepEqual(d, { api: false, web: false, worker: false, migrate: false });
});

test("render emits the machine-readable variables", () => {
  const out = render({ api: true, web: false, worker: true, migrate: false });
  assert.deepEqual(out.split("\n"), ["API=true", "WEB=false", "WORKER=true", "MIGRATE=false", "ALL=false"]);
});
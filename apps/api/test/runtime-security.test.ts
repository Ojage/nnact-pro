import assert from "node:assert/strict";
import test from "node:test";
import { resolveCorsOrigin, resolveJwtSecret, resolvePublicWebUrl } from "../src/runtime-security.js";

test("production rejects missing, default, and short JWT secrets", () => {
  for (const value of [undefined, "change-me-in-production", "too-short"]) {
    assert.throws(
      () => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: value } as NodeJS.ProcessEnv),
      /JWT_SECRET/,
    );
  }
});

test("production accepts a sufficiently long unique JWT secret", () => {
  const secret = "r7o4Brz97ezjVdPkbAeLPr9VK2Xp9MHWdQ7cR8AL";
  assert.equal(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: secret } as NodeJS.ProcessEnv), secret);
});

test("development uses a development-only fallback", () => {
  assert.match(resolveJwtSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv), /development-only/);
});

test("production requires explicit HTTPS CORS origins", () => {
  assert.throws(() => resolveCorsOrigin({ NODE_ENV: "production" } as NodeJS.ProcessEnv), /CORS_ORIGIN/);
  assert.throws(
    () => resolveCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "*" } as NodeJS.ProcessEnv),
    /wildcard/,
  );
  assert.throws(
    () => resolveCorsOrigin({ NODE_ENV: "production", CORS_ORIGIN: "http://example.com" } as NodeJS.ProcessEnv),
    /HTTPS/,
  );
  assert.deepEqual(
    resolveCorsOrigin({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://app.openfieldpro.example,https://admin.openfieldpro.example",
    } as NodeJS.ProcessEnv),
    ["https://app.openfieldpro.example", "https://admin.openfieldpro.example"],
  );
});

test("payment redirects require an exact HTTPS web origin in production", () => {
  assert.throws(() => resolvePublicWebUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv), /PUBLIC_WEB_URL/);
  assert.throws(
    () => resolvePublicWebUrl({ NODE_ENV: "production", PUBLIC_WEB_URL: "http://openfieldpro.example" } as NodeJS.ProcessEnv),
    /HTTPS/,
  );
  assert.throws(
    () => resolvePublicWebUrl({ NODE_ENV: "production", PUBLIC_WEB_URL: "https://openfieldpro.example/path" } as NodeJS.ProcessEnv),
    /without a path/,
  );
  assert.equal(
    resolvePublicWebUrl({ NODE_ENV: "production", PUBLIC_WEB_URL: "https://openfieldpro.example/" } as NodeJS.ProcessEnv),
    "https://openfieldpro.example",
  );
});

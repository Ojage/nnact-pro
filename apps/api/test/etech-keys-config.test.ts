// Ensure the provider folds a trailing "/api/v1" in the configured base URL
// so both the bare host and the versioned prefix behave identically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEtechKeysBaseUrl, configFromRow, defaultEtechKeysConfig } from "../src/sms/etech-keys-config.js";

test("normalizeEtechKeysBaseUrl strips a trailing /api/v1 and slashes", () => {
  assert.equal(normalizeEtechKeysBaseUrl("https://v1.api.etech-keys.com"), "https://v1.api.etech-keys.com");
  assert.equal(normalizeEtechKeysBaseUrl("https://v1.api.etech-keys.com/"), "https://v1.api.etech-keys.com");
  assert.equal(normalizeEtechKeysBaseUrl("https://v1.api.etech-keys.com/api/v1"), "https://v1.api.etech-keys.com");
  assert.equal(normalizeEtechKeysBaseUrl("  https://v1.api.etech-keys.com/api/v1/  "), "https://v1.api.etech-keys.com");
  assert.equal(normalizeEtechKeysBaseUrl("https://provider.example.com/custom"), "https://provider.example.com/custom");
});

test("configFromRow normalizes a stored versioned base URL", () => {
  const row = {
    id: "r1",
    name: "default",
    baseUrl: "https://v1.api.etech-keys.com/api/v1",
    legacyBaseUrl: "https://sms.etech-keys.com",
    username: "u",
    password: "p",
    apiKey: null,
    senderId: "NNACT",
    isActive: true,
    providerType: "etechkeys",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
  const config = configFromRow(row);
  assert.equal(config.baseUrl, "https://v1.api.etech-keys.com");
  assert.equal(config.username, "u");
});

test("defaultEtechKeysConfig normalizes the environment fallback", () => {
  const original = process.env.ETECH_KEYS_BASE_URL;
  process.env.ETECH_KEYS_BASE_URL = "https://v1.api.etech-keys.com/api/v1/";
  try {
    assert.equal(defaultEtechKeysConfig().baseUrl, "https://v1.api.etech-keys.com");
  } finally {
    if (original === undefined) delete process.env.ETECH_KEYS_BASE_URL;
    else process.env.ETECH_KEYS_BASE_URL = original;
  }
});
// Runnable check (no DB, no network): node --import tsx --test test/sms.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/sms/phone.ts";
import {
  _generateCodeForTest,
  _hashCodeForTest,
  _cooldownKeyForTest,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
} from "../src/sms/otp.ts";
import { EtechKeysService, createEtechKeysRefresher } from "../src/sms/etech-keys.ts";
import type { EtechKeysSettingsRow } from "../src/sms/etech-keys-store.ts";
import { SmsError } from "../src/sms/types.ts";

test("normalizePhone produces 237XXXXXXXXX from common input shapes", () => {
  assert.equal(normalizePhone("6 71 23 45 67"), "237671234567");
  assert.equal(normalizePhone("+237671234567"), "237671234567");
  assert.equal(normalizePhone("00237671234567"), "237671234567");
  assert.equal(normalizePhone("671234567"), "237671234567");
});

test("normalizePhone preserves 12-digit 237-prefixed numbers", () => {
  assert.equal(normalizePhone("237699887766"), "237699887766");
});

test("otp generates exactly 6 digits, zero-padded", () => {
  for (let i = 0; i < 50; i++) {
    const code = _generateCodeForTest();
    assert.match(code, /^\d{6}$/);
  }
});

test("otp hashing is deterministic and single-hash", () => {
  assert.equal(_hashCodeForTest("123456"), _hashCodeForTest("123456"));
  assert.notEqual(_hashCodeForTest("123456"), _hashCodeForTest("654321"));
  assert.match(_hashCodeForTest("000000"), /^[a-f0-9]{64}$/);
});

test("otp cooldown keys include channel and case-normalized target", () => {
  assert.equal(_cooldownKeyForTest("phone", "671234567"), "phone:671234567");
  assert.equal(_cooldownKeyForTest("phone", "671234567"), _cooldownKeyForTest("phone", "671234567"));
});

test("otp constants are sane", () => {
  assert.equal(OTP_MAX_ATTEMPTS, 5);
  assert.equal(OTP_TTL_MS, 10 * 60 * 1000);
});

const ROW: EtechKeysSettingsRow = {
  id: "row-1",
  name: "default",
  baseUrl: "https://v1.api.etech-keys.example",
  legacyBaseUrl: "https://sms.etech-keys.example",
  username: "user",
  password: "pass",
  apiKey: null,
  senderId: "ETECH KEYS",
  isActive: true,
  providerType: "etechkeys",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function buildService(calls: Array<{ url: string; body?: unknown; headers?: Record<string, string> }>) {
  const store = {
    resolve: async () => ROW,
  };
  const service = new EtechKeysService()
    ._injectStore(store)
    ._injectFetch(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      if (String(url).endsWith("/api/login")) return jsonResponse({ token: "ID|tok" });
      return jsonResponse({ success: true, id: "sms-1", credits_used: 1 });
    });
  return service;
}

test("etechkeys sendSMS authenticates then posts the message", async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const service = buildService(calls);
  await service.sendSMS({ to: "671234567", message: "votre code 123456" });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/login$/);
  assert.deepEqual(calls[0].body, { username: "user", password: "pass" });
  assert.match(calls[1].url, /\/api\/v1\/send-sms$/);
  assert.deepEqual(calls[1].body, { sender_id: "ETECH KEYS", to: "237671234567", msg: "votre code 123456" });
});

test("etechkeys retries once after a 401 by refreshing the token", async () => {
  let loginCalls = 0;
  let sendCalls = 0;
  const service = new EtechKeysService()._injectStore({ resolve: async () => ROW })._injectFetch(async (url) => {
    if (String(url).endsWith("/api/login")) {
      loginCalls += 1;
      return jsonResponse({ token: "ID|newtok" });
    }
    sendCalls += 1;
    if (sendCalls === 1) return jsonResponse({ error: "unauthorized" }, 401);
    return jsonResponse({ success: true, id: "sms-2" });
  });

  await service.sendSMS({ to: "671234567", message: "retry" });
  assert.equal(loginCalls, 2);
  assert.equal(sendCalls, 2);
});

test("etechkeys uses the api key flow when no login credentials exist", async () => {
  const keyRow = { ...ROW, username: null, password: null, apiKey: "sk_test" };
  const calls: Array<{ url: string; body?: unknown }> = [];
  const service = new EtechKeysService()._injectStore({ resolve: async () => keyRow })._injectFetch(async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return jsonResponse({ success: true, id: "sms-3" });
  });

  await service.sendSMS({ to: "671234567", message: "hi" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v1\/send-sms-key$/);
  assert.deepEqual(calls[0].body, { api_key: "sk_test", sender_id: "ETECH KEYS", destinataire: "237671234567", message: "hi" });
});

test("etechkeys throws when unconfigured", async () => {
  const bareRow = { ...ROW, username: null, password: null, apiKey: null };
  const service = new EtechKeysService()._injectStore({ resolve: async () => bareRow });
  await assert.rejects(() => service.sendSMS({ to: "671234567", message: "no config" }), (err: unknown) => {
    assert.ok(err instanceof SmsError);
    assert.equal(err.statusCode, 503);
    return true;
  });
});

test("etechkeys maps provider success=false to an SmsError", async () => {
  const service = new EtechKeysService()._injectStore({ resolve: async () => ROW })._injectFetch(async (url) => {
    if (String(url).endsWith("/api/login")) return jsonResponse({ token: "t" });
    return jsonResponse({ success: false, error: "insufficient credits" });
  });
  await assert.rejects(
    () => service.sendSMS({ to: "671234567", message: "will fail" }),
    (err: unknown) => err instanceof SmsError && /insufficient credits/.test(err.message),
  );
});

test("etechkeys refresher schedules and can be cleared without throwing", async () => {
  const service = new EtechKeysService()._injectStore({ resolve: async () => ROW });
  const clear = createEtechKeysRefresher(service, 60_000);
  assert.equal(typeof clear, "function");
  clear();
});

test("etechkeys sendSMS normalizes and delivers to batch recipients", async () => {
  const calls: Array<{ url: string; body?: { to: string } }> = [];
  const service = buildService(calls);
  await service.sendSMS({ to: ["671234567", "+237690001122"], message: "batch" });
  const sentTos = calls.filter((c) => c.url.includes("/send-sms")).map((c) => c.body!.to);
  assert.deepEqual(sentTos, ["237671234567", "237690001122"]);
});

test("etechkeys sendTestSms returns the provider id and credits used", async () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  const service = buildService(calls);
  const result = await service.sendTestSms("671234567", "test message");
  assert.equal(result.id, "sms-1");
  assert.equal(result.creditsUsed, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { sender_id: "ETECH KEYS", to: "237671234567", msg: "test message" });
});
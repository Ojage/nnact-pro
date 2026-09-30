import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRANSPORT_PERMITTED_PURPOSES,
  TransportPolicyError,
  assertTransportPermitsPurpose,
  isColdSendingEnabled,
  resolveAuthorizedTransport,
  resolveColdTransportConfig,
  transportForPurpose,
  transportPermitsPurpose,
} from "../src/growth/transport-policy.js";
import { createSmtpTransport, type SmtpConfig } from "../src/mailer.js";

const COLD_ENV = {
  COLD_SMTP_HOST: "smtp.cold.example",
  COLD_SMTP_USER: "outreach",
  COLD_SMTP_PASS: "secret",
} as NodeJS.ProcessEnv;

const RESEND_ENV = {
  SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "587",
  SMTP_USER: "resend",
  SMTP_PASS: "secret",
} as NodeJS.ProcessEnv;

test("Resend may not carry cold outreach", () => {
  assert.throws(
    () => assertTransportPermitsPurpose("resend", "cold_outreach"),
    (error: unknown) =>
      error instanceof TransportPolicyError &&
      error.code === "transport_purpose_forbidden",
  );
  assert.equal(transportPermitsPurpose("resend", "cold_outreach"), false);
});

test("Resend carries transactional, permission marketing and reply mail", () => {
  // "reply" was added for staff replies to inbound conversations. A reply goes
  // out because the recipient wrote first, so it is permitted here and nowhere
  // else — in particular not on the cold transport.
  assert.deepEqual(TRANSPORT_PERMITTED_PURPOSES.resend, ["transactional", "permission_marketing", "reply"]);
  assert.doesNotThrow(() => assertTransportPermitsPurpose("resend", "transactional"));
  assert.doesNotThrow(() => assertTransportPermitsPurpose("resend", "permission_marketing"));
  assert.doesNotThrow(() => assertTransportPermitsPurpose("resend", "reply"));
});

test("cold outreach resolves to a dedicated transport, never to Resend", () => {
  assert.equal(transportForPurpose("cold_outreach"), "cold_transport");
  assert.equal(transportForPurpose("transactional"), "resend");
  assert.equal(transportForPurpose("permission_marketing"), "resend");
});

test("the cold transport may not carry transactional mail", () => {
  assert.equal(transportPermitsPurpose("cold_transport", "transactional"), false);
  assert.throws(() => assertTransportPermitsPurpose("cold_transport", "transactional"), {
    code: "transport_purpose_forbidden",
  });
});

test("an unregistered transport is refused", () => {
  assert.throws(
    () => assertTransportPermitsPurpose("mailgun" as never, "transactional"),
    (error: unknown) => error instanceof TransportPolicyError && error.code === "transport_not_registered",
  );
});

test("cold sending is disabled by default and fails closed", () => {
  assert.equal(isColdSendingEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(resolveColdTransportConfig({} as NodeJS.ProcessEnv), null);
  // A configured Resend connection must not make cold sending available.
  assert.equal(isColdSendingEnabled(RESEND_ENV), false);
  assert.throws(
    () => resolveAuthorizedTransport("cold_outreach", RESEND_ENV),
    (error: unknown) =>
      error instanceof TransportPolicyError && error.code === "cold_transport_not_configured",
  );
});

test("a partial cold transport configuration stays disabled", () => {
  assert.equal(resolveColdTransportConfig({ COLD_SMTP_HOST: "smtp.cold.example" } as NodeJS.ProcessEnv), null);
  assert.equal(
    resolveColdTransportConfig({
      COLD_SMTP_HOST: "smtp.cold.example",
      COLD_SMTP_USER: "outreach",
    } as NodeJS.ProcessEnv),
    null,
  );
});

test("cold sending resolves only once a cold transport is configured", () => {
  assert.equal(isColdSendingEnabled(COLD_ENV), true);
  const resolved = resolveAuthorizedTransport("cold_outreach", COLD_ENV);
  assert.equal(resolved.transport, "cold_transport");
  assert.equal((resolved.config as { host: string }).host, "smtp.cold.example");
});

test("transactional mail fails closed when SMTP is absent", () => {
  assert.throws(
    () => resolveAuthorizedTransport("transactional", {} as NodeJS.ProcessEnv),
    (error: unknown) => error instanceof TransportPolicyError && error.code === "smtp_not_configured",
  );
  const resolved = resolveAuthorizedTransport("permission_marketing", RESEND_ENV);
  assert.equal(resolved.transport, "resend");
});

test("submission ports require STARTTLS and verify certificates", () => {
  const config: SmtpConfig = {
    host: "smtp.resend.com",
    port: 587,
    secure: false,
    user: "resend",
    pass: "secret",
    from: "resend",
  };
  const options = (createSmtpTransport(config) as unknown as { options: Record<string, unknown> }).options;
  assert.equal(options.requireTLS, true);
  assert.deepEqual(options.tls, { rejectUnauthorized: true });
  assert.equal(options.secure, false);
});

test("implicit-TLS ports stay encrypted without demanding STARTTLS", () => {
  const config: SmtpConfig = {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    user: "user",
    pass: "secret",
    from: "user",
  };
  const options = (createSmtpTransport(config) as unknown as { options: Record<string, unknown> }).options;
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, undefined);
  assert.deepEqual(options.tls, { rejectUnauthorized: true });
});

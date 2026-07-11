import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupportEntitlement,
  generateLicenseSigningKeyPair,
  signSupportEntitlement,
  verifySupportEntitlement,
} from "../src/license-keys.js";

const pair = generateLicenseSigningKeyPair();
const now = new Date("2026-07-11T12:00:00.000Z");

function validPayload() {
  return createSupportEntitlement({
    organization: "OpenFieldPro Test Sponsor",
    tier: "business",
    seats: 12,
    issuedAt: "2026-07-11T11:00:00.000Z",
    expiresAt: "2027-07-11T11:00:00.000Z",
    features: ["priority-support", "sponsor-recognition"],
    licenseId: "2d789507-f575-4aaf-a6d7-5802a2eed769",
  });
}

test("a generated key verifies with the matching public key", () => {
  const token = signSupportEntitlement(validPayload(), pair.privateKey);
  const result = verifySupportEntitlement(token, pair.publicKey, { now });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.payload.organization, "OpenFieldPro Test Sponsor");
    assert.equal(result.payload.seats, 12);
    assert.equal(result.keyFingerprint.length, 64);
  }
});

test("tampering invalidates the signature", () => {
  const token = signSupportEntitlement(validPayload(), pair.privateKey);
  const [prefix, payload, signature] = token.split(".");
  const tamperedPayload = Buffer.from(JSON.stringify({ ...validPayload(), seats: 999 })).toString("base64url");
  const result = verifySupportEntitlement(`${prefix}.${tamperedPayload}.${signature}`, pair.publicKey, { now });
  assert.deepEqual(result.valid, false);
  if (!result.valid) assert.equal(result.reason, "signature verification failed");
  assert.notEqual(payload, tamperedPayload);
});

test("a different public key cannot verify the token", () => {
  const token = signSupportEntitlement(validPayload(), pair.privateKey);
  const otherPair = generateLicenseSigningKeyPair();
  const result = verifySupportEntitlement(token, otherPair.publicKey, { now });
  assert.equal(result.valid, false);
});

test("expired and not-yet-active keys fail closed", () => {
  const expired = createSupportEntitlement({
    organization: "Expired",
    issuedAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2025-12-31T00:00:00.000Z",
  });
  const expiredResult = verifySupportEntitlement(
    signSupportEntitlement(expired, pair.privateKey),
    pair.publicKey,
    { now },
  );
  assert.equal(expiredResult.valid, false);
  if (!expiredResult.valid) assert.equal(expiredResult.reason, "key has expired");

  const future = createSupportEntitlement({
    organization: "Future",
    issuedAt: "2026-07-11T11:00:00.000Z",
    notBefore: "2026-07-13T00:00:00.000Z",
  });
  const futureResult = verifySupportEntitlement(
    signSupportEntitlement(future, pair.privateKey),
    pair.publicKey,
    { now, clockSkewMs: 0 },
  );
  assert.equal(futureResult.valid, false);
  if (!futureResult.valid) assert.equal(futureResult.reason, "key is not active yet");
});

test("invalid expiration ordering is rejected before signing", () => {
  const invalid = createSupportEntitlement({
    organization: "Invalid",
    issuedAt: "2026-07-11T11:00:00.000Z",
    expiresAt: "2026-07-11T10:00:00.000Z",
  });
  assert.throws(() => signSupportEntitlement(invalid, pair.privateKey), /expiresAt must be later/);
});

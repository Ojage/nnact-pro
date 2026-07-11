import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { z } from "zod";

const TOKEN_PREFIX = "ofp1";
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const supportEntitlementSchema = z
  .object({
    version: z.literal(1),
    licenseId: z.string().uuid(),
    organization: z.string().trim().min(1).max(200),
    tier: z.enum(["supporter", "business", "partner"]),
    seats: z.number().int().positive().max(100_000),
    issuedAt: z.string().datetime(),
    notBefore: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    features: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  })
  .strict();

export type SupportEntitlement = z.infer<typeof supportEntitlementSchema>;

export interface VerificationSuccess {
  valid: true;
  payload: SupportEntitlement;
  keyFingerprint: string;
}

export interface VerificationFailure {
  valid: false;
  reason: string;
  keyFingerprint?: string;
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

function parseDate(value: string, field: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} is not a valid timestamp`);
  return date;
}

export function generateLicenseSigningKeyPair() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

export function publicKeyFingerprint(publicKeyPem: string) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function createSupportEntitlement(input: {
  organization: string;
  tier?: SupportEntitlement["tier"];
  seats?: number;
  expiresAt?: string;
  notBefore?: string;
  features?: string[];
  issuedAt?: string;
  licenseId?: string;
}): SupportEntitlement {
  return supportEntitlementSchema.parse({
    version: 1,
    licenseId: input.licenseId ?? randomUUID(),
    organization: input.organization,
    tier: input.tier ?? "supporter",
    seats: input.seats ?? 1,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    features: input.features ?? [],
  });
}

export function signSupportEntitlement(payload: SupportEntitlement, privateKeyPem: string) {
  const parsed = supportEntitlementSchema.parse(payload);
  const issuedAt = parseDate(parsed.issuedAt, "issuedAt");
  if (parsed.notBefore && parseDate(parsed.notBefore, "notBefore").getTime() < issuedAt.getTime()) {
    throw new Error("notBefore cannot be earlier than issuedAt");
  }
  if (parsed.expiresAt && parseDate(parsed.expiresAt, "expiresAt").getTime() <= issuedAt.getTime()) {
    throw new Error("expiresAt must be later than issuedAt");
  }

  const payloadSegment = encode(JSON.stringify(parsed));
  const signingInput = `${TOKEN_PREFIX}.${payloadSegment}`;
  const signature = cryptoSign(null, Buffer.from(signingInput), createPrivateKey(privateKeyPem));
  return `${signingInput}.${encode(signature)}`;
}

export function verifySupportEntitlement(
  token: string,
  publicKeyPem: string,
  options: { now?: Date; clockSkewMs?: number } = {},
): VerificationResult {
  let fingerprint: string | undefined;
  try {
    fingerprint = publicKeyFingerprint(publicKeyPem);
    const segments = token.trim().split(".");
    if (segments.length !== 3 || segments[0] !== TOKEN_PREFIX) {
      return { valid: false, reason: "invalid key format", keyFingerprint: fingerprint };
    }

    const [prefix, payloadSegment, signatureSegment] = segments;
    const signingInput = `${prefix}.${payloadSegment}`;
    const signatureValid = cryptoVerify(
      null,
      Buffer.from(signingInput),
      createPublicKey(publicKeyPem),
      decode(signatureSegment),
    );
    if (!signatureValid) {
      return { valid: false, reason: "signature verification failed", keyFingerprint: fingerprint };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(decode(payloadSegment).toString("utf8"));
    } catch {
      return { valid: false, reason: "payload is not valid JSON", keyFingerprint: fingerprint };
    }

    const parsed = supportEntitlementSchema.safeParse(raw);
    if (!parsed.success) {
      return { valid: false, reason: "payload failed schema validation", keyFingerprint: fingerprint };
    }

    const now = options.now ?? new Date();
    const skew = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
    const issuedAt = parseDate(parsed.data.issuedAt, "issuedAt");
    if (issuedAt.getTime() > now.getTime() + skew) {
      return { valid: false, reason: "key was issued in the future", keyFingerprint: fingerprint };
    }
    if (parsed.data.notBefore && parseDate(parsed.data.notBefore, "notBefore").getTime() > now.getTime() + skew) {
      return { valid: false, reason: "key is not active yet", keyFingerprint: fingerprint };
    }
    if (parsed.data.expiresAt) {
      const expiresAt = parseDate(parsed.data.expiresAt, "expiresAt");
      if (expiresAt.getTime() <= issuedAt.getTime()) {
        return { valid: false, reason: "key expiration is invalid", keyFingerprint: fingerprint };
      }
      if (expiresAt.getTime() <= now.getTime() - skew) {
        return { valid: false, reason: "key has expired", keyFingerprint: fingerprint };
      }
    }

    return { valid: true, payload: parsed.data, keyFingerprint: fingerprint };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : "verification failed",
      ...(fingerprint ? { keyFingerprint: fingerprint } : {}),
    };
  }
}

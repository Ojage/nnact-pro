/**
 * OTP codes for phone/email verification.
 *
 * Codes are 6 digits, hashed with SHA-256 before storage (plaintext is never
 * persisted), expire after OTP_TTL_MS, and allow OTP_MAX_ATTEMPTS before
 * being consumed. Sends are throttled in-memory (per-target, per-process).
 *
 * In non-production environments when SMS is not configured, the code is
 * returned as `devCode` so flows can be exercised without a live provider.
 */
import { createHash, randomInt } from "node:crypto";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { db, verificationCodes } from "@nnact/db";
import { renderSmsTemplate } from "./templates.js";
import { sendSms } from "./sms.js";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_HOURLY_LIMIT = 5;

const OTP_TEXT = (code: string) =>
  renderSmsTemplate("otp_login", { code, companyName: process.env.SMS_ALIAS ?? "NNACT", ttlMinutes: OTP_TTL_MS / 60_000 });

export interface OtpRequestResult {
  sent: boolean;
  /** Only populated in non-production when SMS is not configured. */
  devCode?: string;
}

export interface OtpVerificationResult {
  ok: boolean;
  reason?: "expired" | "too_many_attempts" | "not_found" | "invalid";
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const resendCooldowns = new Map<string, number>();
const hourlyCounts = new Map<string, [number, number]>();

function cooldownKey(channel: string, target: string): string {
  return `${channel}:${target.toLocaleLowerCase()}`;
}

/** True if the last send for this target was more than `ms` ago. */
function allowResend(channel: string, target: string): boolean {
  const key = cooldownKey(channel, target);
  const last = resendCooldowns.get(key) ?? 0;
  return Date.now() - last >= OTP_RESEND_COOLDOWN_MS;
}

function bumpHourly(channel: string, target: string): boolean {
  const key = cooldownKey(channel, target);
  const [count, windowStart] = hourlyCounts.get(key) ?? [0, Date.now()];
  if (Date.now() - windowStart >= 3600_000) {
    hourlyCounts.set(key, [1, Date.now()]);
    return true;
  }
  if (count >= OTP_HOURLY_LIMIT) return false;
  hourlyCounts.set(key, [count + 1, windowStart]);
  return true;
}

/**
 * Generates, persists, and (for phone) delivers an OTP. Returns the dev code
 * when sending is impossible and we are not in production.
 */
export async function requestOtp(
  target: string,
  channel: "phone" | "email",
  purpose = "login",
): Promise<OtpRequestResult> {
  const isProd = process.env.NODE_ENV === "production";
  const normalized = target.trim().toLowerCase();
  if (!allowResend(channel, normalized)) {
    return { sent: false };
  }
  if (!bumpHourly(channel, normalized)) {
    return { sent: false };
  }

  const code = generateCode();
  await db.insert(verificationCodes).values({
    purpose,
    channel,
    target: normalized,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });

  resendCooldowns.set(cooldownKey(channel, normalized), Date.now());

  if (channel === "phone") {
    try {
      await sendSms(normalized, OTP_TEXT(code));
      return { sent: true };
    } catch {
      if (isProd) throw new Error("sms sending failed");
      // Falls through — in dev we surface the code so flows can be tested.
    }
  }

  if (isProd) return { sent: false };
  return { sent: true, devCode: code };
}

/** Verifies a submitted code against the latest live record for the target. */
export async function verifyOtp(
  target: string,
  code: string,
  purpose = "login",
): Promise<OtpVerificationResult> {
  const normalized = target.trim().toLowerCase();
  const now = new Date();
  const [record] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.target, normalized),
        eq(verificationCodes.purpose, purpose),
        eq(verificationCodes.channel, "phone"),
        isNull(verificationCodes.usedAt),
        gt(verificationCodes.expiresAt, now),
      ),
    )
    .orderBy(verificationCodes.createdAt)
    .limit(1);

  if (!record) return { ok: false, reason: "not_found" };

  const candidateHash = hashCode(code.trim());
  if (record.codeHash !== candidateHash) {
    const attempts = record.attempts + 1;
    if (attempts >= record.maxAttempts) {
      // Consume the record: too many failed attempts.
      await db.update(verificationCodes).set({ usedAt: now }).where(eq(verificationCodes.id, record.id));
      return { ok: false, reason: "too_many_attempts" };
    }
    await db.update(verificationCodes).set({ attempts }).where(eq(verificationCodes.id, record.id));
    return { ok: false, reason: "invalid" };
  }

  await db.update(verificationCodes).set({ usedAt: now }).where(eq(verificationCodes.id, record.id));
  return { ok: true };
}

/** Optional purge for expired/unused codes (sweep can call this from the worker). */
export async function purgeExpiredOtps(): Promise<void> {
  await db.delete(verificationCodes).where(lte(verificationCodes.expiresAt, new Date()));
}

/** Exposed for tests. */
export function _hashCodeForTest(code: string): string {
  return hashCode(code);
}

/** Exposed for tests — defaults mirror the constants above. */
export function _generateCodeForTest(): string {
  return generateCode();
}

/** Exposed for tests. */
export function _cooldownKeyForTest(channel: string, target: string): string {
  return cooldownKey(channel, target);
}

export function _resetOtpMapsForTest(): void {
  resendCooldowns.clear();
  hourlyCounts.clear();
}
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { authRefreshTokens, db } from "@nnact/db";

export const REFRESH_TOKEN_PREFIX = "rt_";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateRefreshToken() {
  const token = `${REFRESH_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashRefreshToken(token) };
}

export async function issueRefreshToken(input: {
  subjectType: "staff" | "customer";
  subjectId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const generated = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const [row] = await db
    .insert(authRefreshTokens)
    .values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      tokenHash: generated.tokenHash,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    })
    .returning();
  return { token: generated.token, row };
}

export async function rotateRefreshToken(input: {
  presentedToken: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const tokenHash = hashRefreshToken(input.presentedToken);
  const [existing] = await db.select().from(authRefreshTokens).where(eq(authRefreshTokens.tokenHash, tokenHash)).limit(1);
  if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
    return { kind: "invalid" as const };
  }

  const generated = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const [replacement] = await db
    .insert(authRefreshTokens)
    .values({
      subjectType: existing.subjectType,
      subjectId: existing.subjectId,
      tokenHash: generated.tokenHash,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    })
    .returning();

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date(), replacedById: replacement.id })
    .where(and(eq(authRefreshTokens.id, existing.id), isNull(authRefreshTokens.revokedAt)));

  return {
    kind: "ok" as const,
    subjectType: existing.subjectType as "staff" | "customer",
    subjectId: existing.subjectId,
    refreshToken: generated.token,
  };
}

export async function revokeRefreshToken(presentedToken: string) {
  const tokenHash = hashRefreshToken(presentedToken);
  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)));
}

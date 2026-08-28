// Password hashing with Node's stdlib scrypt — no bcrypt/argon dependency.
// Format stored in users.password_hash:  "<saltHex>:<hashHex>".
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AUTH_AUDIENCES } from "@nnact/shared";

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface StaffJwtClaims {
  aud: typeof AUTH_AUDIENCES.staff;
  userId: string;
  orgId: string;
  role: string;
  name?: string;
  email?: string;
  mustChangePassword?: boolean;
}

export interface CustomerJwtClaims {
  aud: typeof AUTH_AUDIENCES.customer;
  accountId: string;
  name?: string;
  email?: string;
}

/** @deprecated Use StaffJwtClaims — kept for backward compatibility during migration. */
export type JwtClaims = StaffJwtClaims;

export function isStaffClaims(claims: unknown): claims is StaffJwtClaims {
  if (!claims || typeof claims !== "object") return false;
  const aud = (claims as { aud?: unknown }).aud;
  return aud === AUTH_AUDIENCES.staff || aud === undefined;
}

export function isCustomerClaims(claims: unknown): claims is CustomerJwtClaims {
  return Boolean(
    claims &&
      typeof claims === "object" &&
      (claims as { aud?: unknown }).aud === AUTH_AUDIENCES.customer &&
      typeof (claims as { accountId?: unknown }).accountId === "string",
  );
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: StaffJwtClaims | CustomerJwtClaims;
    user: StaffJwtClaims | CustomerJwtClaims;
  }
}

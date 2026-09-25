// Role policy for the Growth & Outreach module.
//
// Growth work is commercial and outbound-facing, so it is narrower than general
// office access:
//
//   read            → owner, dispatcher, secretary
//   write prospects → owner, dispatcher
//   verify / approve → owner only
//   technician      → no access at all
//
// Technicians are excluded deliberately: the module holds prospect research and
// customer contact details, not field work. Reads are gated here in the handler
// because the global prefix guard in operational-authorization.ts only governs
// writes, so a prefix entry alone would leave prospects readable by technicians.

import type { FastifyReply } from "fastify";
import { verifiedClaims } from "../operational-authorization.js";
import type { JwtClaims } from "../auth.js";

export function canReadGrowth(role: string): boolean {
  return role === "owner" || role === "dispatcher" || role === "secretary";
}

export function canWriteGrowth(role: string): boolean {
  return role === "owner" || role === "dispatcher";
}

/** Verifying an inbox and approving it for cold outreach are owner-only. */
export function canManageSenderIdentities(role: string): boolean {
  return role === "owner";
}

export async function requireGrowthRead(
  request: Parameters<typeof verifiedClaims>[0],
  reply: FastifyReply,
): Promise<JwtClaims | null> {
  const claims = await verifiedClaims(request, reply);
  if (!claims || reply.sent) return null;
  if (!canReadGrowth(claims.role)) {
    await reply.code(403).send({ error: "growth and outreach access requires an office role" });
    return null;
  }
  return claims;
}

export async function requireGrowthWrite(
  request: Parameters<typeof verifiedClaims>[0],
  reply: FastifyReply,
): Promise<JwtClaims | null> {
  const claims = await requireGrowthRead(request, reply);
  if (!claims) return null;
  if (!canWriteGrowth(claims.role)) {
    await reply.code(403).send({ error: "prospect and sender changes require an owner or dispatcher" });
    return null;
  }
  return claims;
}

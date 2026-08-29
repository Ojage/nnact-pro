import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isStaffClaims, type StaffJwtClaims } from "./auth.js";
import { resolveOrgId } from "./routes/org.js";
import { verifiedClaims } from "./operational-authorization.js";

/**
 * Validate a staff access token passed as ?token= so native media players
 * (RN <Image>, expo-av) can fetch protected files without custom headers.
 */
export async function queryTokenClaims(
  app: FastifyInstance,
  req: FastifyRequest,
): Promise<StaffJwtClaims | null> {
  const token = (req.query as { token?: string } | undefined)?.token;
  if (!token) return null;
  try {
    const decoded = (await app.jwt.verify(token)) as unknown;
    if (!isStaffClaims(decoded)) return null;
    const claims = decoded as StaffJwtClaims;
    if (!claims.orgId || !claims.userId || !["owner", "dispatcher", "technician"].includes(claims.role)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/** Resolve the requesting org from the header, falling back to a ?token= staff token. */
export async function resolveOrgIdWithQueryToken(
  app: FastifyInstance,
  req: FastifyRequest,
): Promise<string> {
  try {
    return await resolveOrgId(req);
  } catch {
    const claims = await queryTokenClaims(app, req);
    if (!claims?.orgId) throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
    return claims.orgId;
  }
}

/** Claims from the header, or from the ?token= staff token when no header is present. */
export async function verifiedClaimsForQueryToken(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<StaffJwtClaims | null> {
  if (req.headers.authorization) {
    return (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
  }
  const claims = await queryTokenClaims(app, req);
  if (!claims) {
    await reply.code(401).send({ error: "authentication required" });
    return null;
  }
  return claims;
}
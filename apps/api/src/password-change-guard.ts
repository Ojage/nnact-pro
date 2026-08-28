import type { FastifyReply, FastifyRequest } from "fastify";
import { isStaffClaims } from "./auth.js";

const EXEMPT_PREFIXES = [
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/refresh",
];

/** Block staff API usage until a provisional password is replaced. */
export async function passwordChangeRequiredGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = (request.url.split("?")[0] ?? request.url).replace(/\/+$/, "") || "/";
  if (EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;

  try {
    await request.jwtVerify();
  } catch {
    return;
  }

  if (!isStaffClaims(request.user)) return;
  const claims = request.user;
  if (!claims.mustChangePassword) return;

  await reply.code(403).send({
    error: "password change required",
    code: "PASSWORD_CHANGE_REQUIRED",
    hint: "Set a new password before using NNACT Pro.",
  });
}

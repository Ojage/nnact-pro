import type { FastifyReply, FastifyRequest } from "fastify";

/** Repair Brain permission paths — review/verify require owner or dispatcher. */
const REVIEW_PATHS = [
  /^\/api\/repair-brain\/proposals\/[^/]+\/review$/,
  /^\/api\/repair-brain\/proposals\/[^/]+\/verify$/,
  /^\/api\/repair-brain\/faults\/[^/]+\/verify$/,
  /^\/api\/repair-brain\/procedures\/[^/]+\/verify$/,
  /^\/api\/repair-brain\/parts\/[^/]+\/verify$/,
];

const MANAGE_PATHS = [
  /^\/api\/repair-brain\/models\/[^/]+$/,
];

function isReviewRequest(req: FastifyRequest): boolean {
  const path = req.url.split("?")[0] ?? req.url;
  if (req.method === "GET") return false;
  return REVIEW_PATHS.some((p) => p.test(path));
}

function isManageDelete(req: FastifyRequest): boolean {
  const path = req.url.split("?")[0] ?? req.url;
  return req.method === "DELETE" && MANAGE_PATHS.some((p) => p.test(path));
}

export async function repairBrainAuthorizationGuard(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isReviewRequest(req) && !isManageDelete(req)) return;

  try {
    await req.jwtVerify();
    const claims = req.user as { role?: string } | undefined;
    if (claims?.role === "owner" || claims?.role === "dispatcher") return;
    await reply.code(403).send({
      error: "repair brain review/verify requires owner or dispatcher access",
    });
  } catch {
    if (process.env.NODE_ENV !== "production" && !req.headers.authorization) return;
    await reply.code(401).send({ error: "authentication required" });
  }
}

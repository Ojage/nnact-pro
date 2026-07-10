import type { FastifyReply, FastifyRequest } from "fastify";

const AUTHORING_PATHS = [
  /^\/api\/diagnostics\/workflows(?:\/[^/]+\/steps)?$/,
  /^\/api\/diagnostics\/workflows\/[^/]+\/publish$/,
  /^\/api\/diagnostics\/steps\/[^/]+\/routes$/,
];

function isProtectedAuthoringRequest(req: FastifyRequest): boolean {
  const path = req.url.split("?")[0] ?? req.url;
  if (req.method === "GET") return false;
  if (req.method === "PATCH" && path.startsWith("/api/diagnostics/corrections/")) return true;
  return AUTHORING_PATHS.some((pattern) => pattern.test(path));
}

export async function diagnosticAuthoringGuard(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isProtectedAuthoringRequest(req)) return;

  try {
    await req.jwtVerify();
    const claims = req.user as { role?: string } | undefined;
    if (claims?.role === "owner" || claims?.role === "dispatcher") return;
    await reply.code(403).send({
      error: "diagnostic authoring requires owner or dispatcher/technical-lead access",
    });
  } catch {
    // Preserve the repository's explicit development fallback, but never allow
    // unauthenticated authoring in production.
    if (process.env.NODE_ENV !== "production" && !req.headers.authorization) return;
    await reply.code(401).send({ error: "authentication required for diagnostic authoring" });
  }
}

// Scoped-token authentication for the INBOUND plugin API surface
// (/api/plugin/*). A plugin presents its per-install token as
// `Authorization: Bearer NNP…`; we look it up by hash, enforce required
// scopes, and attach the resolved identity to the request.
import type { FastifyRequest, FastifyReply } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db, apiTokens } from "@nnact/db";
import { hashToken } from "./crypto.js";

export interface PluginAuth {
  orgId: string;
  installId: string | null;
  scopes: string[];
  tokenId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    pluginAuth?: PluginAuth;
  }
}

/**
 * Fastify preHandler factory. Authenticates the request via a scoped API token
 * and, if `required` scopes are given, enforces that the token carries ALL of
 * them (a `*` scope is a wildcard that satisfies any requirement). On success
 * sets `req.pluginAuth`; on failure replies 401/403 and stops the route.
 */
export function requireToken(required: string[] = []) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return reply.code(401).send({ error: "missing bearer token" });

    const [row] = await db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
    if (!row) return reply.code(401).send({ error: "invalid token" });
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return reply.code(401).send({ error: "token expired" });
    }

    const scopes = row.scopes ?? [];
    const wildcard = scopes.includes("*");
    const missing = wildcard ? [] : required.filter((s) => !scopes.includes(s));
    if (missing.length) {
      return reply.code(403).send({ error: "insufficient scope", missing });
    }

    // Best-effort last-used stamp; never block the request on it.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id))
      .catch(() => {});

    req.pluginAuth = { orgId: row.orgId, installId: row.installId, scopes, tokenId: row.id };
  };
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { applyOps } from "../sync/executor.js";
import {
  roleCanSyncOperation,
  verifiedClaims,
  type UserRole,
} from "../operational-authorization.js";

const REQUEST_Z = z.object({
  ops: z
    .array(
      z
        .object({
          opId: z.string().min(1).max(64),
          type: z.enum(["create", "update", "delete"]),
          table: z.enum([
            "jobs",
            "line_items",
            "invoices",
            "appointments",
            "customers",
            "estimates",
            "payments",
          ]),
          entityId: z.string().uuid(),
          baseVersion: z.number().int().positive().optional(),
          payload: z.record(z.string(), z.unknown()),
        })
        .strict(),
    )
    .min(1)
    .max(500),
});

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/sync", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const parsed = REQUEST_Z.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "bad request",
        issues: parsed.error.issues.slice(0, 10),
      });
    }

    const role = claims.role as UserRole;
    const denied = parsed.data.ops.filter((operation) => !roleCanSyncOperation(role, operation));
    if (denied.length) {
      return reply.code(403).send({
        error: "one or more offline operations are not permitted for this role",
        denied: denied.map(({ opId, table, type }) => ({ opId, table, type })),
      });
    }

    const results = await applyOps(db, orgId, parsed.data.ops, {
      role,
      userId: claims.userId,
    });
    return { results };
  });
}

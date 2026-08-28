import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, sql, count } from "drizzle-orm";
import { db, users } from "@nnact/db";
import { buildTeamMemberDefaultPassword } from "@nnact/shared";
import { hashPassword } from "../auth.js";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { guardTeamChange, guardTeamCreate, type TeamChange, type UserRole } from "../team-safeguards.js";
import type { JwtClaims } from "../auth.js";
import type { CreateTeamMemberResponseDTO, UserDTO } from "@nnact/shared";

const patchUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["owner", "dispatcher", "technician"]).optional(),
  active: z.boolean().optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  role: z.enum(["dispatcher", "technician"]),
});

function toUserDto(row: {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: Date;
}): UserDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    role: row.role as UserDTO["role"],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select({
        id: users.id,
        orgId: users.orgId,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.active, true)))
      .orderBy(users.name);
    return rows.map(toUserDto);
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const guard = guardTeamCreate({ id: claims.userId, role: claims.role as UserRole });
    if (!guard.ok) return reply.code(guard.code).send({ error: guard.error, hint: guard.hint });

    const email = parsed.data.email.toLowerCase();
    const temporaryPassword = buildTeamMemberDefaultPassword(parsed.data.name);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return { conflict: true as const };

      const [row] = await tx
        .insert(users)
        .values({
          orgId,
          email,
          name: parsed.data.name.trim(),
          role: parsed.data.role,
          active: true,
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        })
        .returning({
          id: users.id,
          orgId: users.orgId,
          email: users.email,
          name: users.name,
          role: users.role,
          active: users.active,
          createdAt: users.createdAt,
        });

      return { conflict: false as const, row };
    });

    if (result.conflict) {
      return reply.code(409).send({ error: "an account with this email already exists" });
    }

    const payload: CreateTeamMemberResponseDTO = {
      user: toUserDto(result.row),
      temporaryPassword,
    };
    return reply.code(201).send(payload);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const changes: TeamChange[] = [];
    if (parsed.data.role !== undefined) {
      changes.push({ kind: "role", targetRole: parsed.data.role as UserRole });
    }
    if (parsed.data.active === false) {
      changes.push({ kind: "deactivate" });
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);

      const [target] = await tx
        .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .limit(1);
      if (!target) return { status: 404 as const, body: { error: "not found" } };

      const [{ value: ownerTotal }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "owner"), eq(users.active, true)));
      const otherActiveOwners = ownerTotal - (target.role === "owner" && target.active ? 1 : 0);

      const actor: { id: string; role: UserRole } = {
        id: claims.userId,
        role: claims.role as UserRole,
      };

      for (const change of changes) {
        const guard = guardTeamChange(
          { actor, target: { id: target.id, role: target.role as UserRole, active: target.active }, otherActiveOwners },
          change,
        );
        if (!guard.ok) return { status: guard.code as 403 | 409, body: { error: guard.error, hint: guard.hint } };
      }

      const [row] = await tx
        .update(users)
        .set(parsed.data)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
      return { status: 200 as const, body: row };
    });

    return reply.code(result.status).send(result.body);
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);

      const [target] = await tx
        .select({ id: users.id, role: users.role, active: users.active })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .limit(1);
      if (!target) return { status: 404 as const, body: { error: "not found" } };

      const [{ value: ownerTotal }] = await tx
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.orgId, orgId), eq(users.role, "owner"), eq(users.active, true)));
      const otherActiveOwners = ownerTotal - (target.role === "owner" && target.active ? 1 : 0);

      const actor: { id: string; role: UserRole } = { id: claims.userId, role: claims.role as UserRole };
      const guard = guardTeamChange(
        { actor, target: { id: target.id, role: target.role as UserRole, active: target.active }, otherActiveOwners },
        { kind: "remove" },
      );
      if (!guard.ok) return { status: guard.code as 403 | 409, body: { error: guard.error, hint: guard.hint } };

      await tx
        .update(users)
        .set({ active: false })
        .where(and(eq(users.orgId, orgId), eq(users.id, id)));
      return { status: 204 as const, body: undefined };
    });

    if (result.status === 204) return reply.code(204).send();
    return reply.code(result.status).send(result.body);
  });
}
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { eq, and, ne, sql, count } from "drizzle-orm";
import { db, users } from "@nnact/db";
import { buildTeamMemberDefaultPassword } from "@nnact/shared";
import { hashPassword } from "../auth.js";
import { normalizePhone } from "../sms/phone.js";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { guardTeamChange, guardTeamCreate, type TeamChange, type UserRole } from "../team-safeguards.js";
import { saveUserAvatar, deleteUserAvatar } from "../uploads.js";
import type { JwtClaims } from "../auth.js";
import type { CreateTeamMemberResponseDTO, UserDTO } from "@nnact/shared";

const patchUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(7).max(20).optional().nullable(),
  role: z.enum(["owner", "dispatcher", "secretary", "technician"]).optional(),
  active: z.boolean().optional(),
  /** Profile fields editable by self or owner. */
  title: z.string().trim().max(120).optional().nullable(),
  about: z.string().trim().max(500).optional().nullable(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  role: z.enum(["dispatcher", "secretary", "technician"]),
});

function toUserDto(row: {
  id: string;
  orgId: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
  title: string | null;
  about: string | null;
  profilePictureUrl: string | null;
}): UserDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role as UserDTO["role"],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    title: row.title,
    about: row.about,
    profilePictureUrl: row.profilePictureUrl,
  };
}

export async function userRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { files: 1, fileSize: 2 * 1024 * 1024, fields: 0 } });

  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db
      .select({
        id: users.id,
        orgId: users.orgId,
        email: users.email,
        name: users.name,
        phone: users.phone,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
        title: users.title,
        about: users.about,
        profilePictureUrl: users.profilePictureUrl,
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

      const [existing] = await tx.select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.active, true))).limit(1);
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
          phone: users.phone,
          role: users.role,
          active: users.active,
          createdAt: users.createdAt,
          title: users.title,
          about: users.about,
          profilePictureUrl: users.profilePictureUrl,
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

    const identityChange =
      parsed.data.name !== undefined || parsed.data.email !== undefined || parsed.data.phone !== undefined;
    if (identityChange && claims.role !== "owner") {
      return reply.code(403).send({
        error: "Only owners can edit team member details.",
        hint: "Ask an owner to make this change.",
      });
    }

    const profileChange = parsed.data.title !== undefined || parsed.data.about !== undefined;
    if (profileChange && claims.userId !== id && claims.role !== "owner") {
      return reply.code(403).send({
        error: "Only owners or the member themselves can edit profile fields.",
        hint: "Edit your own profile, or ask an owner.",
      });
    }

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
        .select({ id: users.id, email: users.email, name: users.name, phone: users.phone, role: users.role, active: users.active })
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

      const setFields: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) setFields.name = parsed.data.name.trim();
      if (parsed.data.email !== undefined) setFields.email = parsed.data.email.trim().toLowerCase();
      if (parsed.data.role !== undefined) setFields.role = parsed.data.role;
      if (parsed.data.active !== undefined) setFields.active = parsed.data.active;
      if (parsed.data.phone !== undefined) {
        const nextPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
        if (nextPhone !== (target.phone ?? null)) setFields.phoneVerifiedAt = null;
        setFields.phone = nextPhone;
      }
      if (parsed.data.title !== undefined) setFields.title = parsed.data.title ? parsed.data.title.trim() : null;
      if (parsed.data.about !== undefined) setFields.about = parsed.data.about ? parsed.data.about.trim() : null;

      if (typeof setFields.email === "string" && (setFields.email as string) !== target.email) {
        const existingEmail = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, setFields.email as string), eq(users.active, true), ne(users.id, id)))
          .limit(1);
        if (existingEmail[0]) return { status: 409 as const, body: { error: "an account with this email already exists" } };
      }
      if (typeof setFields.phone === "string" && (setFields.phone as string) !== (target.phone ?? "")) {
        const existingPhone = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.phone, setFields.phone as string), eq(users.active, true), ne(users.id, id)))
          .limit(1);
        if (existingPhone[0]) return { status: 409 as const, body: { error: "an account with this phone number already exists" } };
      }

      const [row] = await tx
        .update(users)
        .set(setFields)
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .returning({ id: users.id, orgId: users.orgId, email: users.email, name: users.name, phone: users.phone, role: users.role, active: users.active, createdAt: users.createdAt,
                     title: users.title, about: users.about, profilePictureUrl: users.profilePictureUrl });
      return { status: 200 as const, body: toUserDto(row) };
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

  /** Upload or replace the user's profile picture. Returns the updated UserDTO. */
  app.post("/:id/avatar", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };
    const isSelf = claims.userId === id;
    if (!isSelf && claims.role !== "owner") {
      return reply.code(403).send({ error: "Only owners or the member themselves can update a profile picture." });
    }

    try {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no image uploaded" });
      await saveUserAvatar(orgId, id, { stream: file.file, filenameHint: file.filename ?? null });
      const publicApiOrigin = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.hostname}`).replace(/\/$/, "");
      const profilePictureUrl = `${publicApiOrigin}/api/public/${orgId}/avatar/${id}?v=${Date.now()}`;
      const [row] = await db
        .update(users)
        .set({ profilePictureUrl })
        .where(and(eq(users.orgId, orgId), eq(users.id, id)))
        .returning({ id: users.id, orgId: users.orgId, email: users.email, name: users.name, phone: users.phone,
                     role: users.role, active: users.active, createdAt: users.createdAt,
                     title: users.title, about: users.about, profilePictureUrl: users.profilePictureUrl });
      if (!row) {
        await deleteUserAvatar(orgId, id);
        return reply.code(404).send({ error: "not found" });
      }
      return reply.code(200).send(toUserDto(row));
    } catch (error) {
      const uploadError = error as { statusCode?: number; code?: string; message?: string } | null;
      if (uploadError?.statusCode) return reply.code(uploadError.statusCode).send({ error: uploadError.message ?? "avatar upload failed" });
      if (uploadError?.code?.includes("TOO_LARGE")) return reply.code(413).send({ error: "avatar exceeds the 2 MB size limit" });
      req.log.error({ err: error }, "user avatar upload failed");
      return reply.code(500).send({ error: "internal error" });
    }
  });

  /** Remove the user's profile picture. Returns the updated UserDTO. */
  app.delete("/:id/avatar", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    let claims: JwtClaims;
    try {
      await req.jwtVerify();
      claims = req.user as JwtClaims;
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    const { id } = req.params as { id: string };
    const isSelf = claims.userId === id;
    if (!isSelf && claims.role !== "owner") {
      return reply.code(403).send({ error: "Only owners or the member themselves can remove a profile picture." });
    }

    await deleteUserAvatar(orgId, id);
    const [row] = await db
      .update(users)
      .set({ profilePictureUrl: null })
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning({ id: users.id, orgId: users.orgId, email: users.email, name: users.name, phone: users.phone,
                   role: users.role, active: users.active, createdAt: users.createdAt,
                   title: users.title, about: users.about, profilePictureUrl: users.profilePictureUrl });
    if (!row) return reply.code(404).send({ error: "not found" });
    return toUserDto(row);
  });
}
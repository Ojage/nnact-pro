import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, orgs, users } from "@nnact/db";
import { validatePasswordStrength } from "@nnact/shared";
import {
  hashPassword,
  verifyPassword,
  isStaffClaims,
  type StaffJwtClaims,
} from "../auth.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { publicRegistrationEnabled } from "../runtime-security.js";
import { clearSessionCookie, setSessionCookie } from "../session-cookie.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../refresh-tokens.js";

const registerBody = z.object({
  orgName: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

const refreshBody = z.object({
  refreshToken: z.string().trim().min(10).max(512),
});

const registerRateLimit = createFixedWindowRateLimit({
  max: 5,
  windowMs: 60 * 60 * 1000,
  key: requestIpKey,
});

const loginRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const email = typeof (request.body as { email?: unknown } | undefined)?.email === "string"
      ? (request.body as { email: string }).email.trim().toLowerCase()
      : "unknown";
    return `${requestIpKey(request)}:${email}`;
  },
});

const WEB_STAFF_SESSION_SECONDS = 12 * 60 * 60;

function signStaffAccessToken(
  app: FastifyInstance,
  user: {
    id: string;
    orgId: string;
    role: string;
    name: string;
    email: string;
    mustChangePassword?: boolean;
  },
  expiresInSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
) {
  return app.jwt.sign(
    {
      aud: "staff",
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: Boolean(user.mustChangePassword),
    } satisfies StaffJwtClaims,
    { expiresIn: expiresInSeconds },
  );
}

function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string;
  mustChangePassword?: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

async function staffAuthResponse(
  app: FastifyInstance,
  reply: FastifyReply,
  user: {
    id: string;
    orgId: string;
    role: string;
    name: string;
    email: string;
    mustChangePassword?: boolean;
  },
  req: FastifyRequest,
  setCookie: boolean,
) {
  const sessionSeconds = setCookie ? WEB_STAFF_SESSION_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
  const accessToken = signStaffAccessToken(app, user, sessionSeconds);
  const refresh = await issueRefreshToken({
    subjectType: "staff",
    subjectId: user.id,
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: requestIpKey(req),
  });
  if (setCookie) setSessionCookie(reply, accessToken);
  return {
    token: accessToken,
    accessToken,
    refreshToken: refresh.token,
    expiresIn: sessionSeconds,
    user: publicUser(user),
    orgId: user.orgId,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", { preHandler: registerRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!publicRegistrationEnabled()) {
      return reply.code(403).send({
        error: "public registration is disabled",
        hint: "An owner can temporarily enable NNPALLOW_PUBLIC_REGISTRATION during controlled onboarding.",
      });
    }

    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const passwordError = validatePasswordStrength(parsed.data.password);
    if (passwordError) return reply.code(400).send({ error: passwordError });

    const { orgName, name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return { conflict: true as const };

      const [org] = await tx.insert(orgs).values({ name: orgName }).returning();
      const [user] = await tx
        .insert(users)
        .values({
          orgId: org.id,
          email,
          name,
          role: "owner",
          passwordHash: await hashPassword(password),
          mustChangePassword: false,
        })
        .returning();
      return { conflict: false as const, org, user };
    });

    if (result.conflict) return reply.code(409).send({ error: "an account with this email already exists" });

    const payload = await staffAuthResponse(app, reply, {
      ...result.user,
      mustChangePassword: result.user.mustChangePassword,
    }, req, true);
    return reply.code(201).send(payload);
  });

  app.post("/login", { preHandler: loginRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }

    return staffAuthResponse(app, reply, {
      id: user.id,
      orgId: user.orgId,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    }, req, true);
  });

  app.post("/change-password", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "authentication required" });
    }
    if (!isStaffClaims(req.user)) {
      return reply.code(401).send({ error: "staff session required" });
    }
    const claims = req.user;

    const parsed = changePasswordBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const passwordError = validatePasswordStrength(parsed.data.newPassword);
    if (passwordError) return reply.code(400).send({ error: passwordError });

    const [user] = await db.select().from(users).where(eq(users.id, claims.userId)).limit(1);
    if (!user?.active || !user.passwordHash) return reply.code(401).send({ error: "account inactive" });
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(401).send({ error: "current password is incorrect" });
    }
    if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
      return reply.code(400).send({ error: "choose a password different from your current one" });
    }

    const [updated] = await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
      })
      .where(eq(users.id, user.id))
      .returning();

    return staffAuthResponse(app, reply, {
      id: updated.id,
      orgId: updated.orgId,
      role: updated.role,
      name: updated.name,
      email: updated.email,
      mustChangePassword: false,
    }, req, true);
  });

  app.post("/refresh", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = refreshBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const rotated = await rotateRefreshToken({
      presentedToken: parsed.data.refreshToken,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: requestIpKey(req),
    });
    if (rotated.kind !== "ok" || rotated.subjectType !== "staff") {
      return reply.code(401).send({ error: "invalid refresh token" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, rotated.subjectId)).limit(1);
    if (!user?.active || !user.passwordHash) return reply.code(401).send({ error: "account inactive" });

    const accessToken = signStaffAccessToken(app, {
      id: user.id,
      orgId: user.orgId,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
    }, WEB_STAFF_SESSION_SECONDS);
    setSessionCookie(reply, accessToken);
    return {
      token: accessToken,
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: WEB_STAFF_SESSION_SECONDS,
      user: publicUser({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        mustChangePassword: user.mustChangePassword,
      }),
      orgId: user.orgId,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  });

  app.post("/logout", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = refreshBody.safeParse(req.body ?? {});
    if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!isStaffClaims(req.user)) {
      return reply.code(401).send({ error: "staff session required" });
    }
    const claims = req.user;
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1);
    if (!row) return reply.code(401).send({ error: "unauthorized" });
    return publicUser(row);
  });
}

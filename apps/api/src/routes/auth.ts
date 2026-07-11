import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, orgs, users } from "@ofp/db";
import { hashPassword, verifyPassword } from "../auth.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";

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

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", { preHandler: registerRateLimit }, async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
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
        })
        .returning();
      return { conflict: false as const, org, user };
    });

    if (result.conflict) {
      return reply.code(409).send({ error: "an account with this email already exists" });
    }

    const token = app.jwt.sign({
      userId: result.user.id,
      orgId: result.org.id,
      role: result.user.role,
      name: result.user.name,
      email: result.user.email,
    } as Parameters<typeof app.jwt.sign>[0]);
    return reply.code(201).send({
      token,
      user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
      orgId: result.org.id,
    });
  });

  app.post("/login", { preHandler: loginRateLimit }, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const token = app.jwt.sign({
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      name: user.name,
      email: user.email,
    } as Parameters<typeof app.jwt.sign>[0]);
    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      orgId: user.orgId,
    };
  });

  app.get("/me", async (req, reply) => {
    try {
      await req.jwtVerify();
      return req.user;
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}

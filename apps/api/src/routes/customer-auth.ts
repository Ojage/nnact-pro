import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, orgs, customers, customerAccounts, customerAccountLinks } from "@nnact/db";
import { validatePasswordStrength } from "@nnact/shared";
import { hashPassword, verifyPassword, isCustomerClaims, type CustomerJwtClaims } from "../auth.js";
import { createFixedWindowRateLimit, requestIpKey } from "../rate-limit.js";
import { resolveDefaultOrgId } from "../runtime-security.js";
import { ACCESS_TOKEN_TTL_SECONDS, issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../refresh-tokens.js";
import { clearCustomerSessionCookie, setCustomerSessionCookie } from "../customer-session-cookie.js";
import { buildPortalSession } from "../portal-session.js";
import { activePortalLinkForCustomer } from "../customer-auth-context.js";
import {
  portalApproveEstimateForActiveLink,
  portalCheckoutForActiveLink,
  portalDeclineEstimateForActiveLink,
  resolveCustomerActiveLink,
} from "../customer-portal-mutations.js";

const checkoutBody = z.object({ invoiceId: z.string().uuid() });
const estimateDecisionBody = z.object({
  optionId: z.string().uuid(),
  signatureName: z.string().trim().max(200).optional(),
});

const registerBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
  orgId: z.string().uuid().optional(),
  phone: z.string().trim().max(50).optional(),
});

const loginBody = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

const refreshBody = z.object({
  refreshToken: z.string().trim().min(10).max(512),
});

const authRateLimit = createFixedWindowRateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  key: (request: FastifyRequest) => {
    const email = typeof (request.body as { email?: unknown } | undefined)?.email === "string"
      ? (request.body as { email: string }).email.trim().toLowerCase()
      : "unknown";
    return `${requestIpKey(request)}:customer:${email}`;
  },
});

const registerRateLimit = createFixedWindowRateLimit({
  max: 5,
  windowMs: 60 * 60 * 1000,
  key: (request: FastifyRequest) => `${requestIpKey(request)}:customer-register`,
});

async function linkedOrgs(accountId: string) {
  const rows = await db
    .select({
      orgId: customerAccountLinks.orgId,
      orgName: orgs.name,
      customerId: customerAccountLinks.customerId,
      linkedVia: customerAccountLinks.linkedVia,
    })
    .from(customerAccountLinks)
    .innerJoin(orgs, eq(customerAccountLinks.orgId, orgs.id))
    .where(eq(customerAccountLinks.accountId, accountId));
  return rows.map((row) => ({
    orgId: row.orgId,
    orgName: row.orgName,
    customerId: row.customerId,
    linkedVia: row.linkedVia,
  }));
}

function signCustomerAccessToken(app: FastifyInstance, account: { id: string; name: string; email: string }) {
  return app.jwt.sign(
    { aud: "customer", accountId: account.id, name: account.name, email: account.email } satisfies CustomerJwtClaims,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

async function authResponse(app: FastifyInstance, reply: FastifyReply, account: { id: string; name: string; email: string }, req: FastifyRequest) {
  const accessToken = signCustomerAccessToken(app, account);
  const refresh = await issueRefreshToken({
    subjectType: "customer",
    subjectId: account.id,
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: requestIpKey(req),
  });
  return {
    accessToken,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: { id: account.id, name: account.name, email: account.email },
    orgs: await linkedOrgs(account.id),
  };
}

async function verifyCustomerRequest(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  if (!isCustomerClaims(req.user)) {
    await reply.code(401).send({ error: "invalid customer session" });
    return null;
  }
  return req.user;
}

async function resolveTargetOrgId(requested?: string) {
  const orgId = requested ?? resolveDefaultOrgId();
  if (!orgId) return null;
  const [org] = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  return org?.id ?? null;
}

export async function customerAuthRoutes(app: FastifyInstance) {
  app.post("/register", { preHandler: registerRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const passwordError = validatePasswordStrength(parsed.data.password);
    if (passwordError) return reply.code(400).send({ error: passwordError });

    const email = parsed.data.email.toLowerCase();
    const orgId = await resolveTargetOrgId(parsed.data.orgId);
    if (!orgId) {
      return reply.code(400).send({
        error: "organization is not configured for customer signup",
        hint: "Set DEFAULT_ORG_ID on the API server or pass orgId during registration.",
      });
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`customer:${email}`}))`);
      const [existingAccount] = await tx.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1);
      if (existingAccount) return { conflict: true as const };

      const [account] = await tx
        .insert(customerAccounts)
        .values({ email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) })
        .returning();

      const [customer] = await tx
        .insert(customers)
        .values({ orgId, name: parsed.data.name, email, phone: parsed.data.phone ?? null })
        .returning();

      await tx.insert(customerAccountLinks).values({
        orgId,
        customerId: customer.id,
        accountId: account.id,
        linkedVia: "signup",
      });

      return { conflict: false as const, account };
    });

    if (result.conflict) return reply.code(409).send({ error: "an account with this email already exists" });
    return reply.code(201).send(await authResponse(app, reply, result.account, req));
  });

  app.post("/login", { preHandler: authRateLimit }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const email = parsed.data.email.toLowerCase();

    const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1);
    if (!account?.active || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }

    return authResponse(app, reply, account, req);
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
    if (rotated.kind !== "ok" || rotated.subjectType !== "customer") {
      return reply.code(401).send({ error: "invalid refresh token" });
    }

    const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, rotated.subjectId)).limit(1);
    if (!account?.active) return reply.code(401).send({ error: "account inactive" });

    return {
      accessToken: signCustomerAccessToken(app, account),
      refreshToken: rotated.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: account.id, name: account.name, email: account.email },
      orgs: await linkedOrgs(account.id),
    };
  });

  app.post("/logout", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = refreshBody.safeParse(req.body ?? {});
    if (parsed.success) await revokeRefreshToken(parsed.data.refreshToken);
    clearCustomerSessionCookie(reply);
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const claims = await verifyCustomerRequest(req, reply);
    if (!claims) return;

    const [account] = await db
      .select({ id: customerAccounts.id, name: customerAccounts.name, email: customerAccounts.email })
      .from(customerAccounts)
      .where(eq(customerAccounts.id, claims.accountId))
      .limit(1);
    if (!account) return reply.code(404).send({ error: "account not found" });

    return { user: account, orgs: await linkedOrgs(account.id) };
  });

  app.get("/orgs/:orgId/workspace", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const claims = await verifyCustomerRequest(req, reply);
    if (!claims) return;
    const { orgId } = req.params as { orgId: string };

    const [link] = await db
      .select()
      .from(customerAccountLinks)
      .where(and(eq(customerAccountLinks.accountId, claims.accountId), eq(customerAccountLinks.orgId, orgId)))
      .limit(1);
    if (!link) return reply.code(404).send({ error: "not linked to this business" });

    const active = await activePortalLinkForCustomer(orgId, link.customerId);
    if (!active) return reply.code(404).send({ error: "customer workspace unavailable" });

    const session = await buildPortalSession(active);
    if (!session) return reply.code(410).send({ error: "no portal views available" });
    return session;
  });

  app.post("/orgs/:orgId/checkout", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const claims = await verifyCustomerRequest(req, reply);
    if (!claims) return;
    const { orgId } = req.params as { orgId: string };
    const parsed = checkoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const active = await resolveCustomerActiveLink(claims.accountId, orgId);
    if (!active) return reply.code(404).send({ error: "not linked to this business" });

    const result = await portalCheckoutForActiveLink(active, parsed.data.invoiceId, reply, {
      successUrl: "nnactcustomer://portal?paid=1",
      cancelUrl: "nnactcustomer://portal",
    });
    if (!result) return;
    return result;
  });

  app.post("/orgs/:orgId/estimates/:estimateId/approve", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const claims = await verifyCustomerRequest(req, reply);
    if (!claims) return;
    const { orgId, estimateId } = req.params as { orgId: string; estimateId: string };
    const parsed = estimateDecisionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const active = await resolveCustomerActiveLink(claims.accountId, orgId);
    if (!active) return reply.code(404).send({ error: "not linked to this business" });

    const result = await portalApproveEstimateForActiveLink(active, estimateId, parsed.data, reply);
    if (!result) return;
    return result;
  });

  app.post("/orgs/:orgId/estimates/:estimateId/decline", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const claims = await verifyCustomerRequest(req, reply);
    if (!claims) return;
    const { orgId, estimateId } = req.params as { orgId: string; estimateId: string };

    const active = await resolveCustomerActiveLink(claims.accountId, orgId);
    if (!active) return reply.code(404).send({ error: "not linked to this business" });

    const result = await portalDeclineEstimateForActiveLink(active, estimateId, reply);
    if (!result) return;
    return result;
  });
}

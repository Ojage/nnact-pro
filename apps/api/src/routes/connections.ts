// Publishing connection routes — manage channel credentials (LinkedIn, Meta for
// Facebook/Instagram) via OAuth 2.0. Credentials are encrypted at rest and
// never returned to the client; only status/metadata are exposed.
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, publishingConnections } from "@nnact/db";
import type { PublishingChannel } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { defaultRegistry } from "../publishing/registry.js";
import { encryptSecret } from "../publishing/infra/connection-store.js";
import { providerFetch } from "../publishing/infra/http.js";
import { contentAudit } from "../publishing/infra/audit.js";

const CHANNELS = ["WEBSITE", "LINKEDIN", "FACEBOOK", "INSTAGRAM"] as const;
function isChannel(v: string): v is PublishingChannel {
  return (CHANNELS as readonly string[]).includes(v);
}

const redirectBase = () => (process.env.PUBLIC_WEB_URL ?? "http://localhost:3003").replace(/\/$/, "");

interface OAuthConfig {
  clientId: string;
  clientSecret: string | null;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

function oauthConfigFor(channel: PublishingChannel): OAuthConfig | null {
  switch (channel) {
    case "LINKEDIN":
      return envOAuth(
        process.env.LINKEDIN_CLIENT_ID,
        process.env.LINKEDIN_CLIENT_SECRET,
"https://www.linkedin.com/oauth/v2/authorization",
      "https://www.linkedin.com/oauth/v2/accessToken",
      "w_organization_social r_organization_social openid",
      );
    case "FACEBOOK":
    case "INSTAGRAM":
      return envOAuth(
        process.env.META_APP_ID,
        process.env.META_APP_SECRET,
        "https://www.facebook.com/v21.0/dialog/oauth",
        "https://graph.facebook.com/v21.0/oauth/access_token",
        "pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish",
      );
    default:
      return null;
  }
}

function envOAuth(clientId: string | undefined, clientSecret: string | undefined, authorizeUrl: string, tokenUrl: string, scope: string): OAuthConfig | null {
  if (!clientId) return null;
  return { clientId, clientSecret: clientSecret ?? null, authorizeUrl, tokenUrl, scope };
}

export async function connectionRoutes(app: FastifyInstance) {
  const registry = defaultRegistry();

  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(publishingConnections).where(eq(publishingConnections.orgId, orgId));
    const connections = rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      status: r.status,
      accountName: r.accountName,
      accountId: r.accountId,
      lastValidatedAt: r.lastValidatedAt,
      lastError: r.lastError,
      metadata: r.metadata,
      capabilities: registry.get(r.channel).capabilities,
    }));
    if (!connections.some((c) => c.channel === "WEBSITE")) {
      connections.push({
        id: "",
        channel: "WEBSITE" as const,
        status: "CONNECTED" as const,
        accountName: process.env.PUBLIC_WEB_URL ?? "NNACT Website",
        accountId: null,
        lastValidatedAt: null,
        lastError: null,
        metadata: {},
        capabilities: registry.get("WEBSITE").capabilities,
      });
    }
    return { channels: registry.channels(), connections };
  });

  app.post<{ Params: { channel: string } }>("/:channel/oauth/start", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can connect channels" });

    const channel = req.params.channel as PublishingChannel;
    if (!isChannel(channel) || channel === "WEBSITE") return reply.code(400).send({ error: "unsupported channel" });
    const oauth = oauthConfigFor(channel);
    if (!oauth) return reply.code(503).send({ error: `${channel} OAuth is not configured on this server` });

    const state = Buffer.from(JSON.stringify({ orgId, channel, nonce: Math.random().toString(36).slice(2) })).toString("base64url");
    const url =
      `${oauth.authorizeUrl}?response_type=code&client_id=${encodeURIComponent(oauth.clientId)}` +
      `&redirect_uri=${encodeURIComponent(`${redirectBase()}/oauth/${channel.toLowerCase()}/callback`)}` +
      `&scope=${encodeURIComponent(oauth.scope)}&state=${state}`;

    return { url, state };
  });

  app.post<{ Params: { channel: string } }>("/:channel/oauth/callback", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.body);
    const channel = req.params.channel as PublishingChannel;
    if (!isChannel(channel) || channel === "WEBSITE") return reply.code(400).send({ error: "unsupported channel" });
    const oauth = oauthConfigFor(channel);
    if (!oauth?.clientSecret) return reply.code(503).send({ error: `${channel} OAuth is not configured on this server` });

    // Verify state round-trip (contains org + channel).
    try {
      const parsed = JSON.parse(Buffer.from(body.state, "base64url").toString("utf8"));
      if (parsed.orgId !== orgId || parsed.channel !== channel) throw new Error("state mismatch");
    } catch {
      return reply.code(400).send({ error: "invalid OAuth state" });
    }

    const redirectUri = `${redirectBase()}/oauth/${channel.toLowerCase()}/callback`;
    const tokenRes = await providerFetch(oauth.tokenUrl, {
      method: "POST",
      body: new URLSearchParams(
        channel === "LINKEDIN"
          ? {
              grant_type: "authorization_code",
              code: body.code,
              redirect_uri: redirectUri,
              client_id: oauth.clientId,
              client_secret: oauth.clientSecret,
            }
          : {
              client_id: oauth.clientId,
              client_secret: oauth.clientSecret,
              code: body.code,
              redirect_uri: redirectUri,
            },
      ).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (tokenRes.status >= 400) {
      return reply.code(502).send({ error: "token exchange failed" });
    }

    const tok = tokenRes.body as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (tok.error?.message) return reply.code(502).send({ error: tok.error.message });
    const accessToken = tok.access_token;
    if (!accessToken) return reply.code(502).send({ error: "no access token returned" });

    // Resolve account identity per channel (best-effort).
    const identity = await resolveIdentity(channel, accessToken, oauth.clientId);
    const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null;

    const cipher = encryptSecret(
      JSON.stringify({
        accessToken,
        accountId: identity?.accountId ?? null,
        pageId: identity?.pageId,
        meta: identity?.meta,
      }),
    );

    await db
      .insert(publishingConnections)
      .values({
        orgId,
        channel,
        status: "CONNECTED",
        accountName: identity?.accountName ?? null,
        accountId: identity?.accountId ?? null,
        credentialsCipher: cipher,
        tokenExpiresAt: expiresAt,
        lastValidatedAt: new Date(),
        metadata: identity?.meta ?? {},
      })
      .onConflictDoUpdate({
        target: [publishingConnections.orgId, publishingConnections.channel],
        set: {
          status: "CONNECTED",
          accountName: identity?.accountName ?? null,
          accountId: identity?.accountId ?? null,
          credentialsCipher: cipher,
          tokenExpiresAt: expiresAt,
          lastValidatedAt: new Date(),
          lastError: null,
          metadata: identity?.meta ?? {},
          updatedAt: new Date(),
        },
      });

    await contentAudit(orgId, { actorId: claimsId(req), action: `connection.connected`, details: { channel } });
    return { channel, status: "CONNECTED", accountName: identity?.accountName ?? null };
  });

  app.post<{ Params: { channel: string } }>("/:channel/disconnect", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can disconnect channels" });
    const channel = req.params.channel as PublishingChannel;
    if (!isChannel(channel)) return reply.code(400).send({ error: "unsupported channel" });

    await db
      .update(publishingConnections)
      .set({ status: "DISCONNECTED", credentialsCipher: null, tokenExpiresAt: null, accountName: null, accountId: null, lastError: null, updatedAt: new Date() })
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel)));
    await contentAudit(orgId, { actorId: claims.userId, action: "connection.disconnected", details: { channel } });
    return { channel, status: "DISCONNECTED" };
  });

  app.post<{ Params: { channel: string } }>("/:channel/validate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can validate connections" });
    const channel = req.params.channel as PublishingChannel;
    if (!isChannel(channel)) return reply.code(400).send({ error: "unsupported channel" });

    const provider = registry.get(channel);
    const result = await provider.validateConnection(orgId);
    return result;
  });
}

async function resolveIdentity(channel: PublishingChannel, accessToken: string, clientId: string) {
  try {
    if (channel === "LINKEDIN") {
      const res = await providerFetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status >= 400) return null;
      const body = res.body as { sub?: string; name?: string };

      // Resolve the Company Page the user administers so we can publish as the
      // organization (urn:li:organization:<pageId>). Requires the
      // w_organization_social/r_organization_social scopes.
      let page: { id?: string; entityUrn?: string; localizedName?: string; vanityName?: string } | null = null;
      try {
        const orgs = await providerFetch(
          "https://api.linkedin.com/v2/organizations?q=roleAssignees&role=ADMINISTRATOR&projection=(elements(*(id,localizedName,vanityName,entityUrn)))",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const elements = (orgs.body as { elements?: { id?: string; entityUrn?: string; localizedName?: string; vanityName?: string }[] })?.elements;
        page = Array.isArray(elements) ? (elements[0] ?? null) : null;
      } catch {
        // best-effort: fall through to member identity below
      }

      let pageId: string | null = page?.id ?? null;
      if (!pageId && typeof page?.entityUrn === "string") pageId = page.entityUrn.split(":").pop() ?? null;

      return {
        accountId: body.sub,
        accountName: page?.localizedName ?? body.name ?? null,
        pageId,
        meta: {
          pageId,
          pageName: page?.localizedName ?? null,
          vanityName: page?.vanityName ?? null,
          memberName: body.name ?? null,
          memberSub: body.sub ?? null,
        },
      };
    }

    // Meta: resolve pages for the user token.
    const me = await providerFetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`);
    if (me.status >= 400) return null;
    const meBody = me.body as { id?: string; name?: string };

    const pages = await providerFetch(
      `https://graph.facebook.com/v21.0/${meBody.id ?? "me"}/accounts?fields=id,name,access_token&access_token=${accessToken}`,
    );
    const page = (pages.body as { data?: { id: string; name: string; access_token: string }[] })?.data?.[0];
    if (!page) return { accountId: meBody.id, accountName: meBody.name ?? null, pageId: null, meta: { page: null } };

    if (channel === "INSTAGRAM") {
      const ig = await providerFetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`,
      );
      const igAccount = (ig.body as { instagram_business_account?: { id: string; username?: string } })?.instagram_business_account;
      if (igAccount) {
        return {
          accountId: igAccount.id,
          accountName: igAccount.username ?? null,
          pageId: page.id,
          meta: { page, igProfileId: igAccount.id, appId: clientId, pageAccessToken: page.access_token },
        };
      }
    }

    return {
      accountId: page.id,
      accountName: page.name,
      pageId: page.id,
      meta: { appId: clientId, page, pageAccessToken: page.access_token },
    };
  } catch {
    return null;
  }
}

function claimsId(req: { user?: unknown }) {
  return (req.user as { userId?: string } | undefined)?.userId ?? null;
}

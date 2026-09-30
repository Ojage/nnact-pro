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
import { encryptSecret, decryptSecret } from "../publishing/infra/connection-store.js";
import { providerFetch } from "../publishing/infra/http.js";
import { contentAudit } from "../publishing/infra/audit.js";
import { graphVersionFor } from "../publishing/adapters/facebook.js";

const CHANNELS = ["WEBSITE", "LINKEDIN", "FACEBOOK", "INSTAGRAM"] as const;
function isChannel(v: string): v is PublishingChannel {
  return (CHANNELS as readonly string[]).includes(v);
}

const redirectBase = () => (process.env.PUBLIC_WEB_URL ?? "http://localhost:3003").replace(/\/$/, "");

// A Page access token is a *write* credential for that Page. Every persistence
// site splits channel metadata through `splitChannelMeta` so the token reaches
// `credentialsCipher` and nothing else: the plaintext `metadata` jsonb column is
// returned verbatim by GET / and is readable by anyone with DB access.
const SECRET_META_KEYS = new Set(["pageAccessToken"]);

export function splitChannelMeta(meta: Record<string, unknown>) {
  const publicMeta: Record<string, unknown> = {};
  const secretMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_META_KEYS.has(key)) secretMeta[key] = value;
    else publicMeta[key] = value;
  }
  return { publicMeta, secretMeta };
}

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
      return envOAuth(
        process.env.META_APP_ID,
        process.env.META_APP_SECRET,
        `https://www.facebook.com/${graphVersionFor()}/dialog/oauth`,
        `https://graph.facebook.com/${graphVersionFor()}/oauth/access_token`,
        // Minimum permissions for Page publishing only.
        // pages_manage_engagement is deliberately NOT requested: Meta rejects
        // the whole consent screen with "Invalid Scopes" unless the app is
        // approved for it, and it is not on the standard App Review list.
        // Consequence: DELETE /unpublish may be refused, so edit is a
        // delete-then-repost that can fail on pages the app cannot delete from.
        "pages_show_list,pages_read_engagement,pages_manage_posts",
      );
    case "INSTAGRAM":
      return envOAuth(
        process.env.META_APP_ID,
        process.env.META_APP_SECRET,
        `https://www.facebook.com/${graphVersionFor()}/dialog/oauth`,
        `https://graph.facebook.com/${graphVersionFor()}/oauth/access_token`,
        "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
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
      tokenExpiresAt: r.tokenExpiresAt,
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
        tokenExpiresAt: null,
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

    // Page tokens are secrets: they belong in the encrypted blob only. The
    // plaintext jsonb metadata column gets the public summary, nothing more.
    const { __pages: storedPages, ...restMeta } = (identity?.meta ?? {}) as Record<string, unknown>;
    const pages = Array.isArray(storedPages) ? (storedPages as StoredMetaPage[]) : [];
    const { publicMeta, secretMeta } = splitChannelMeta(restMeta);
    const pageSelectionRequired = publicMeta.pageSelectionRequired === true;

    // Prefer the selected Page token's lifetime (~60 days) over the user
    // token's (~1 hour): that is the credential publishing actually depends on.
    const pageExpiry =
      typeof publicMeta.pageTokenExpiresAt === "string" ? new Date(publicMeta.pageTokenExpiresAt) : null;
    const expiresAt =
      pageExpiry && !Number.isNaN(pageExpiry.getTime())
        ? pageExpiry
        : tok.expires_in
          ? new Date(Date.now() + tok.expires_in * 1000)
          : null;

    // A connection with no Page chosen is not yet usable for publishing, so it
    // is recorded as DISCONNECTED and surfaced as "select a Page" in the UI.
    // The status enum has no PENDING value and the migration path is currently
    // unusable, so pageSelectionRequired in metadata carries the distinction.
    const status = pageSelectionRequired ? ("DISCONNECTED" as const) : ("CONNECTED" as const);

    const cipher = encryptSecret(
      JSON.stringify({
        accessToken,
        accountId: identity?.accountId ?? null,
        pageId: identity?.pageId ?? null,
        meta: { ...publicMeta, ...secretMeta, pages },
      }),
    );

    const values = {
      status,
      accountName: identity?.accountName ?? null,
      accountId: identity?.accountId ?? null,
      credentialsCipher: cipher,
      tokenExpiresAt: expiresAt,
      lastValidatedAt: new Date(),
      metadata: publicMeta,
    };

    await db
      .insert(publishingConnections)
      .values({ orgId, channel, ...values })
      .onConflictDoUpdate({
        target: [publishingConnections.orgId, publishingConnections.channel],
        set: { ...values, lastError: null, updatedAt: new Date() },
      });

    if (pageSelectionRequired) {
      await contentAudit(orgId, {
        actorId: claimsId(req),
        action: "connection.page_selection_required",
        details: { channel, availablePages: publicMeta.availablePages },
      });
      return {
        channel,
        status,
        pageSelectionRequired: true,
        availablePages: publicMeta.availablePages ?? [],
        message:
          pages.length === 0
            ? "No Facebook Pages were shared with this app. Grant Page access and try again."
            : "Select which Page to publish to.",
      };
    }

    await contentAudit(orgId, { actorId: claimsId(req), action: `connection.connected`, details: { channel } });
    return { channel, status: "CONNECTED" as const, accountName: identity?.accountName ?? null, pageSelectionRequired: false };
  });

  // Choose which Page a Meta connection publishes to. The Page tokens were all
  // captured during the OAuth callback and live in the encrypted blob, so this
  // never re-hits Facebook and never re-prompts the user.
  app.post<{ Params: { channel: string }; Body: { pageId?: string } }>("/:channel/select-page", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can select a page" });
    const channel = req.params.channel as PublishingChannel;
    if (!isChannel(channel)) return reply.code(400).send({ error: "unsupported channel" });

    const pageId = req.body?.pageId?.trim();
    if (!pageId) return reply.code(400).send({ error: "pageId is required" });

    const [row] = await db
      .select()
      .from(publishingConnections)
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel)))
      .limit(1);
    const cipher = row?.credentialsCipher;
    if (typeof cipher !== "string" || cipher.length === 0) {
      return reply.code(409).send({ error: "no stored Meta connection; reconnect first" });
    }

    let blob: { accessToken?: string; accountId?: string | null; pageId?: string | null; meta?: { pages?: StoredMetaPage[]; [k: string]: unknown } };
    let plaintext: string | null = null;
    try {
      plaintext = decryptSecret(cipher);
    } catch {
      plaintext = null;
    }
    if (plaintext === null) {
      return reply.code(500).send({ error: "stored credentials could not be decrypted; reconnect the channel" });
    }
    try {
      blob = JSON.parse(plaintext);
    } catch {
      return reply.code(500).send({ error: "stored credentials are malformed; reconnect the channel" });
    }

    const page = blob.meta?.pages?.find((p) => p.id === pageId);
    if (!page) return reply.code(400).send({ error: "that page is not available on this connection" });
    if (!page.canPublish) return reply.code(400).send({ error: `no CREATE_CONTENT task on "${page.name}"` });

    // `pages` is kept in the encrypted blob (it holds every Page token) so a
    // later switch to a different Page still has the list to choose from.
    const { pages: blobPages, ...restBlobMeta } = (blob.meta ?? {}) as Record<string, unknown>;
    const { publicMeta, secretMeta } = splitChannelMeta(restBlobMeta);
    publicMeta.selectedPageId = page.id;
    publicMeta.pageName = page.name;
    publicMeta.pageTokenExpiresAt = page.expiresAt;
    publicMeta.pageSelectionRequired = false;
    secretMeta.pageAccessToken = page.accessToken;

    const encryptedMeta = {
      ...publicMeta,
      ...secretMeta,
      ...(Array.isArray(blobPages) ? { pages: blobPages } : {}),
    };

    await db
      .update(publishingConnections)
      .set({
        status: "CONNECTED",
        accountName: page.name,
        accountId: page.id,
        credentialsCipher: encryptSecret(JSON.stringify({ ...blob, accountId: page.id, pageId: page.id, meta: encryptedMeta })),
        tokenExpiresAt: page.expiresAt ? new Date(page.expiresAt) : null,
        lastError: null,
        metadata: publicMeta,
        updatedAt: new Date(),
      })
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel)));

    await contentAudit(orgId, { actorId: claims.userId, action: "connection.page_selected", details: { channel, pageId: page.id } });
    return { channel, status: "CONNECTED" as const, accountName: page.name, accountId: page.id };
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

    // Meta: enumerate every Page this user can publish to.
    const meta = await resolveMetaIdentity(channel, accessToken, clientId);
    if (!meta) return null;
    return meta.identity;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Meta / Facebook Page connection
// ---------------------------------------------------------------------------

const META_GRAPH_BASE = "https://graph.facebook.com";
/** Page tasks that permit creating content on the Page. */
const META_PUBLISH_TASKS = new Set(["CREATE_CONTENT", "MANAGE"]);

export interface MetaPageSummary {
  id: string;
  name: string;
  picture?: string | null;
  tasks: string[];
  canPublish: boolean;
}

interface StoredMetaPage extends MetaPageSummary {
  /** Long-lived Page access token. Encrypted at rest; never in plaintext. */
  accessToken: string;
  expiresAt: string | null;
}

/** Strip every secret from a page record before it reaches the jsonb column. */
function publicPageSummary(page: MetaPageSummary): MetaPageSummary {
  return { id: page.id, name: page.name, picture: page.picture ?? null, tasks: page.tasks, canPublish: page.canPublish };
}

/**
 * Upgrade a short-lived Page token to a long-lived one (~60 days). Without
 * this the automation connection silently rots roughly every two months and
 * publishing starts failing with error 463 at an unpredictable moment.
 */
async function exchangeLongLivedPageToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string | null,
  version: string,
): Promise<{ accessToken: string; expiresAt: string | null }> {
  if (!appSecret) return { accessToken: shortLivedToken, expiresAt: null };
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const res = await providerFetch(`${META_GRAPH_BASE}/${version}/oauth/access_token?${params.toString()}`);
  if (res.status >= 400) return { accessToken: shortLivedToken, expiresAt: null };
  const body = res.body as { access_token?: string; expires_in?: number };
  if (!body?.access_token) return { accessToken: shortLivedToken, expiresAt: null };
  return {
    accessToken: body.access_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
  };
}

/**
 * List the Pages the user administers, each with a long-lived Page token.
 * `tasks` is requested so we can tell a Page we can actually post to from one
 * we can merely read — surfacing that up front beats a 200 error later.
 */
export async function fetchManagedPages(
  userToken: string,
  appId: string,
  appSecret: string | null,
  version: string,
): Promise<StoredMetaPage[]> {
  // `me/accounts` is a relative edge on /me — the leading slash is required.
  const res = await providerFetch(
    `${META_GRAPH_BASE}/${version}/me/accounts?fields=id,name,picture,tasks,access_token&access_token=${encodeURIComponent(userToken)}`,
  );
  if (res.status >= 400) return [];
  const data = (res.body as { data?: Array<{ id: string; name: string; picture?: { data?: { url?: string } }; tasks?: string[]; access_token?: string }> })?.data;
  if (!Array.isArray(data)) return [];

  const pages: StoredMetaPage[] = [];
  for (const raw of data) {
    if (!raw?.access_token) continue;
    const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    const longLived = await exchangeLongLivedPageToken(raw.access_token, appId, appSecret, version);
    pages.push({
      id: raw.id,
      name: raw.name,
      picture: raw.picture?.data?.url ?? null,
      tasks,
      canPublish: tasks.some((t) => META_PUBLISH_TASKS.has(t)),
      accessToken: longLived.accessToken,
      expiresAt: longLived.expiresAt,
    });
  }
  return pages;
}

/**
 * Decide which Page a Facebook connection will publish to, and build the
 * plaintext-safe metadata. Pure so the decision is testable without a database.
 *
 * Auto-selection only happens when exactly one Page is publishable. Taking
 * `pages[0]` otherwise would risk posting customer content to the wrong Page —
 * a mistake Facebook will happily accept, so we never get a second chance.
 */
export function planMetaConnection(
  pages: StoredMetaPage[],
  opts: { appId: string; userName: string | null; version: string },
) {
  const selectable = pages.filter((p) => p.canPublish);
  const chosen = selectable.length === 1 ? selectable[0]! : null;
  return {
    chosen,
    pageSelectionRequired: chosen === null,
    // Pre-partition metadata. `splitChannelMeta` strips pageAccessToken at each
    // persistence site, so this must not be treated as client-safe on its own.
    meta: {
      appId: opts.appId,
      graphVersion: opts.version,
      userName: opts.userName,
      selectedPageId: chosen?.id ?? null,
      pageName: chosen?.name ?? null,
      pageAccessToken: chosen?.accessToken ?? null,
      pageTokenExpiresAt: chosen?.expiresAt ?? null,
      pageSelectionRequired: chosen === null,
      availablePages: pages.map(publicPageSummary),
    },
  };
}

async function resolveMetaIdentity(channel: PublishingChannel, userToken: string, clientId: string) {
  const version = graphVersionFor();
  const appSecret = process.env.META_APP_SECRET ?? null;

  const me = await providerFetch(`${META_GRAPH_BASE}/${version}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
  if (me.status >= 400) return null;
  const meBody = me.body as { id?: string; name?: string };

  const pages = await fetchManagedPages(userToken, clientId, appSecret, version);
  if (pages.length === 0) {
    return {
      identity: {
        accountId: meBody?.id ?? null,
        accountName: meBody?.name ?? null,
        pageId: null,
        meta: { appId: clientId, graphVersion: version, userName: meBody?.name ?? null, availablePages: [] as MetaPageSummary[], pageSelectionRequired: true, noPagesGranted: true },
      },
    };
  }

  if (channel === "INSTAGRAM") {
    // Instagram publishing runs on the Page's linked business account, so the
    // Page is an intermediate rather than the publishing target. The adapter
    // authenticates with `pageAccessToken`, so the Page token is what is stored.
    // NOTE: this still picks `pages[0]` rather than prompting, so with several
    // Pages it silently binds to whichever one happens to come first. Only one
    // publishable Page is safe until Instagram gets the explicit picker.
    const first = pages[0]!;
    const ig = await providerFetch(
      `${META_GRAPH_BASE}/${version}/${first.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(first.accessToken)}`,
    );
    const igAccount = (ig.body as { instagram_business_account?: { id: string; username?: string } })?.instagram_business_account;
    if (igAccount) {
      return {
        identity: {
          accountId: igAccount.id,
          accountName: igAccount.username ?? null,
          pageId: first.id,
          meta: {
            appId: clientId,
            graphVersion: version,
            igProfileId: igAccount.id,
            // Read by the Instagram adapter (see adapters/instagram.ts). Routed
            // to the encrypted blob by splitChannelMeta, never to plaintext.
            pageAccessToken: first.accessToken,
            pageId: first.id,
            availablePages: pages.map(publicPageSummary),
            pageSelectionRequired: false,
          },
        },
      };
    }
  }

  // Facebook: auto-select when there is exactly one candidate, otherwise leave
  // the choice to the operator.
  const plan = planMetaConnection(pages, { appId: clientId, userName: meBody?.name ?? null, version });

  return {
    identity: {
      accountId: plan.chosen?.id ?? null,
      accountName: plan.chosen?.name ?? null,
      pageId: plan.chosen?.id ?? null,
      meta: {
        ...plan.meta,
        // Encrypted blob material — stripped before the plaintext column write.
        __pages: pages,
      },
    },
  };
}

function claimsId(req: { user?: unknown }) {
  return (req.user as { userId?: string } | undefined)?.userId ?? null;
}

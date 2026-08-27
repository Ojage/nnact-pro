// Plugin management API (org-scoped, owner-facing). Powers the Integrations
// tab: browse the manifest catalog, install/uninstall, toggle, edit config,
// and inspect the outbound-event delivery journal.
//
// Installing a plugin mints two secrets:
//   • a per-install webhook signing secret (whsec_…), stored to sign deliveries;
//   • a scoped API token (NNP…) the plugin uses for inbound calls — the
//     plaintext is returned exactly once here and only its hash is persisted.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, plugins, pluginInstalls, apiTokens, pluginEvents } from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { generateToken, generateWebhookSecret } from "../plugins/crypto.js";

const installBody = z.object({
  pluginId: z.string().uuid(),
  webhookUrl: z.string().url().optional(),
  config: z.record(z.unknown()).optional(),
});

const patchBody = z.object({
  enabled: z.boolean().optional(),
  webhookUrl: z.string().url().nullable().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function pluginRoutes(app: FastifyInstance) {
  // Catalog + this org's install status for each plugin.
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const [catalog, installs] = await Promise.all([
      db.select().from(plugins).orderBy(plugins.name),
      db.select().from(pluginInstalls).where(eq(pluginInstalls.orgId, orgId)),
    ]);
    const byPlugin = new Map(installs.map((i) => [i.pluginId, i]));
    return catalog.map((p) => {
      const install = byPlugin.get(p.id);
      return {
        ...p,
        installed: !!install,
        installId: install?.id ?? null,
        enabled: install?.enabled ?? false,
      };
    });
  });

  // This org's installs (joined with manifest name/slug for display).
  app.get("/installs", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({
        id: pluginInstalls.id,
        pluginId: pluginInstalls.pluginId,
        slug: plugins.slug,
        name: plugins.name,
        enabled: pluginInstalls.enabled,
        config: pluginInstalls.config,
        webhookUrl: pluginInstalls.webhookUrl,
        installedAt: pluginInstalls.installedAt,
      })
      .from(pluginInstalls)
      .innerJoin(plugins, eq(pluginInstalls.pluginId, plugins.id))
      .where(eq(pluginInstalls.orgId, orgId))
      .orderBy(desc(pluginInstalls.installedAt));
  });

  // Install a plugin for this org. Returns the install plus the one-time token.
  app.post("/installs", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = installBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [plugin] = await db.select().from(plugins).where(eq(plugins.id, parsed.data.pluginId));
    if (!plugin) return reply.code(404).send({ error: "plugin not found" });

    const [existing] = await db
      .select({ id: pluginInstalls.id })
      .from(pluginInstalls)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.pluginId, plugin.id)));
    if (existing) return reply.code(409).send({ error: "already installed", installId: existing.id });

    const [install] = await db
      .insert(pluginInstalls)
      .values({
        orgId,
        pluginId: plugin.id,
        webhookUrl: parsed.data.webhookUrl,
        webhookSecret: generateWebhookSecret(),
        config: parsed.data.config ?? {},
      })
      .returning();

    const minted = generateToken();
    await db.insert(apiTokens).values({
      orgId,
      installId: install.id,
      name: `${plugin.slug} token`,
      tokenHash: minted.tokenHash,
      prefix: minted.prefix,
      scopes: plugin.scopes,
    });

    // `token` is shown once — the client must surface it to the user now.
    return reply.code(201).send({ install, token: minted.token, scopes: plugin.scopes });
  });

  app.patch("/installs/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(pluginInstalls)
      .set(parsed.data)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // Uninstall — cascades the install's tokens and event journal (FK on delete).
  app.delete("/installs/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(pluginInstalls)
      .where(and(eq(pluginInstalls.orgId, orgId), eq(pluginInstalls.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });

  // Outbound delivery journal for this org (newest first). Optional ?installId.
  app.get("/events", async (req) => {
    const orgId = await resolveOrgId(req);
    const { installId } = req.query as { installId?: string };
    const conditions = [eq(pluginEvents.orgId, orgId)];
    if (installId) conditions.push(eq(pluginEvents.installId, installId));
    return db
      .select()
      .from(pluginEvents)
      .where(and(...conditions))
      .orderBy(desc(pluginEvents.createdAt))
      .limit(50);
  });
}

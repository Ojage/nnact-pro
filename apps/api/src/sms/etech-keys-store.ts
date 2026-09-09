import { and, eq } from "drizzle-orm";
import { db, etechKeysSettings } from "@nnact/db";
import type { EtechKeysSettingsRow } from "./etech-keys-config.js";
import { configFromRow, defaultEtechKeysConfig, normalizeEtechKeysBaseUrl } from "./etech-keys-config.js";

export type { EtechKeysSettingsRow };
export { configFromRow };

/**
 * CRUD for the persisted EtechKeys settings row. The store resolves the
 * active provider config used by EtechKeysService, seeding one from the
 * environment on first access when no row exists yet.
 */
export const etechKeysSettingsStore = {
  async findActive(): Promise<EtechKeysSettingsRow | null> {
    const [row] = await db
      .select()
      .from(etechKeysSettings)
      .where(and(eq(etechKeysSettings.isActive, true), eq(etechKeysSettings.name, "default")))
      .limit(1);
    return row ?? null;
  },

  async resolve(): Promise<EtechKeysSettingsRow> {
    const active = await this.findActive();
    if (active) return active;
    return this.seedFromEnv();
  },

  async findById(id: string): Promise<EtechKeysSettingsRow | null> {
    const [row] = await db.select().from(etechKeysSettings).where(eq(etechKeysSettings.id, id)).limit(1);
    return row ?? null;
  },

  async findAll(): Promise<EtechKeysSettingsRow[]> {
    return db.select().from(etechKeysSettings).orderBy(etechKeysSettings.name);
  },

  async create(data: Partial<EtechKeysSettingsRow>): Promise<EtechKeysSettingsRow> {
    const [row] = await db
      .insert(etechKeysSettings)
      .values({
        name: data.name ?? "default",
        baseUrl: normalizeEtechKeysBaseUrl(data.baseUrl ?? defaultEtechKeysConfig().baseUrl),
        legacyBaseUrl: data.legacyBaseUrl ?? defaultEtechKeysConfig().legacyBaseUrl,
        username: data.username ?? null,
        password: data.password ?? null,
        apiKey: data.apiKey ?? null,
        senderId: data.senderId ?? defaultEtechKeysConfig().senderId,
        isActive: data.isActive ?? true,
        providerType: data.providerType ?? "etechkeys",
      })
      .returning();
    return row;
  },

  async update(id: string, data: Partial<Omit<EtechKeysSettingsRow, "id">>): Promise<EtechKeysSettingsRow | null> {
    const set: Record<string, unknown> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.baseUrl !== undefined) set.baseUrl = normalizeEtechKeysBaseUrl(data.baseUrl);
    if (data.legacyBaseUrl !== undefined) set.legacyBaseUrl = data.legacyBaseUrl;
    if (data.username !== undefined) set.username = data.username;
    if (data.password !== undefined) set.password = data.password;
    if (data.apiKey !== undefined) set.apiKey = data.apiKey;
    if (data.senderId !== undefined) set.senderId = data.senderId;
    if (data.isActive !== undefined) set.isActive = data.isActive;
    if (data.providerType !== undefined) set.providerType = data.providerType;
    set.updatedAt = new Date();

    const [row] = await db
      .update(etechKeysSettings)
      .set(set)
      .where(eq(etechKeysSettings.id, id))
      .returning();
    return row ?? null;
  },

  async delete(id: string): Promise<void> {
    await db.delete(etechKeysSettings).where(eq(etechKeysSettings.id, id));
  },

  /** Creates a settings row from environment variables if the table is empty. */
  async seedFromEnv(): Promise<EtechKeysSettingsRow> {
    const [existing] = await db.select({ id: etechKeysSettings.id }).from(etechKeysSettings).limit(1);
    if (existing) {
      const row = await this.findById(existing.id);
      return row!;
    }
    const seeded = defaultEtechKeysConfig();
    return this.create({
      name: "default",
      baseUrl: seeded.baseUrl,
      legacyBaseUrl: seeded.legacyBaseUrl,
      username: seeded.username ?? null,
      password: seeded.password ?? null,
      apiKey: seeded.apiKey ?? null,
      senderId: seeded.senderId ?? null,
      isActive: true,
      providerType: "etechkeys",
    });
  },
};
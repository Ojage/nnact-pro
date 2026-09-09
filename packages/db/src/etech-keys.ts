import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/** Persisted EtechKeys SMS provider settings (config in DB with env fallback). */
export const etechKeysSettings = pgTable(
  "etech_keys_settings",
  {
    id: id(),
    /** "default" or a custom profile name. */
    name: text("name").notNull(),
    baseUrl: text("base_url").default("https://v1.api.etech-keys.com").notNull(),
    legacyBaseUrl: text("legacy_base_url").default("https://sms.etech-keys.com").notNull(),
    username: text("username"),
    password: text("password"),
    apiKey: text("api_key"),
    senderId: text("sender_id"),
    isActive: boolean("is_active").default(true).notNull(),
    providerType: text("provider_type").default("etechkeys").notNull(),
    createdAt: ts(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    activeName: uniqueIndex("etech_keys_settings_active_name_idx").on(t.name),
  }),
);

export type EtechKeysSettings = typeof etechKeysSettings.$inferSelect;
export type EtechKeysSettingsInsert = typeof etechKeysSettings.$inferInsert;
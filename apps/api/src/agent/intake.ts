import { and, desc, eq, inArray } from "drizzle-orm";
import { db, customers, users } from "@nnact/db";
import { normalizePhone } from "@nnact/shared";
import { safeNotifyUser } from "../notify-user.js";
import { safeEmitActivity } from "../activities.js";
import { SAFETY_TERMS, type AgentLanguage } from "@nnact/shared";

const FRENCH = /\b(bonjour|merci|frigo|réfrigérateur|refrigerateur|ne marche|fonctionne|fuite|étincelles|etincelles|brûlé|brule|gaz|fumée|fumee|quartier|ville|appareil)\b/i;
const PIDGIN = /\b(wetin|dey|no dey|abeg|how far|which area|wetin be|e dey|e no dey|make we|oga)\b/i;

export function detectLanguage(text: string): AgentLanguage {
  if (PIDGIN.test(text)) return "pidgin";
  if (FRENCH.test(text)) return "fr";
  return "en";
}

/** Fixed safety lexicon. Never infer safety from model output. */
export function detectSafetyFlags(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return [...new Set(SAFETY_TERMS.filter((term) => lower.includes(term)))];
}

/** Exactly one match can be attached; zero or several are resolved by a dispatcher. */
export async function matchCustomersByPhone(orgId: string, phone: string): Promise<typeof customers.$inferSelect[]> {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  const byIndex = await db
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.phoneE164, normalized)))
    .orderBy(desc(customers.createdAt));
  if (byIndex.length) return byIndex;
  const all = await db.select().from(customers).where(eq(customers.orgId, orgId));
  return all.filter((row) => row.phone && normalizePhone(row.phone) === normalized);
}

export async function notifySafetyFlag(input: {
  orgId: string;
  conversationId: string;
  messageId: string;
  flags: string[];
  customerLabel: string;
}): Promise<void> {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, input.orgId), eq(users.active, true), inArray(users.role, ["owner", "dispatcher"])));
  for (const recipient of recipients) {
    void safeNotifyUser(input.orgId, recipient.id, {
      type: "agent.safety_flag",
      title: "Safety words in a WhatsApp intake",
      body: `${input.customerLabel}: ${input.flags.join(", ")}`,
      link: "/agent/drafts",
    });
  }
  safeEmitActivity(input.orgId, "agent.safety_flag", `Safety words flagged in WhatsApp intake: ${input.flags.join(", ")}`, {
    jobId: null,
  });
  void input.conversationId;
  void input.messageId;
}

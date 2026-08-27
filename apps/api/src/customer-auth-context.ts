import { and, eq } from "drizzle-orm";
import { db, orgs, customers } from "@nnact/db";
import { mergeBusinessSettings } from "@nnact/shared";
import type { ActivePortalLink } from "./portal-session.js";

/** Portal session context for an authenticated customer account (no magic link required). */
export async function activePortalLinkForCustomer(orgId: string, customerId: string): Promise<ActivePortalLink | null> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) return null;
  const [customer] = await db
    .select({ name: customers.name, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId)));
  if (!customer) return null;

  const settings = mergeBusinessSettings(org.businessSettings);
  const scopes = [
    "balance",
    "checkout",
    "receipts",
    "service_plans",
    "estimates",
    "service_history",
  ] as const;

  return {
    link: {
      id: "account",
      orgId,
      customerId,
      tokenHash: "account-session",
      tokenPrefix: "account",
      tokenCipher: null,
      scopes: [...scopes],
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      sentCount: 0,
      lastSentAt: null,
      createdAt: new Date(),
    },
    org,
    customer,
    settings,
    scopes: [...scopes],
  };
}

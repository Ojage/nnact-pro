import { and, asc, eq, gte, ilike, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthContactDetails,
  growthProspects,
} from "@nnact/db";

export interface ProspectSelectionRules {
  sectorSlug?: string;
  cities?: string[];
  minFitScore?: number;
  equipmentKeywords?: string[];
  excludeRejected?: boolean;
  limit?: number;
}

export function parseProspectSelectionRules(raw: unknown): ProspectSelectionRules {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    sectorSlug: typeof o.sectorSlug === "string" ? o.sectorSlug : undefined,
    cities: Array.isArray(o.cities) ? o.cities.filter((c): c is string => typeof c === "string") : undefined,
    minFitScore: typeof o.minFitScore === "number" ? o.minFitScore : undefined,
    equipmentKeywords: Array.isArray(o.equipmentKeywords)
      ? o.equipmentKeywords.filter((k): k is string => typeof k === "string")
      : undefined,
    excludeRejected: o.excludeRejected !== false,
    limit: typeof o.limit === "number" ? Math.min(500, Math.max(1, o.limit)) : 200,
  };
}

/** Finds prospects matching campaign rules and returns enrollable email contacts. */
export async function findProspectsForCampaignRules(
  orgId: string,
  rules: ProspectSelectionRules,
): Promise<{ prospectId: string; contactDetailId: string; companyName: string }[]> {
  const limit = rules.limit ?? 200;
  const conditions = [eq(growthProspects.orgId, orgId), isNull(growthProspects.mergedIntoId)];
  if (rules.excludeRejected !== false) conditions.push(isNull(growthProspects.rejectedAt));
  if (rules.sectorSlug) conditions.push(eq(growthProspects.sectorSlug, rules.sectorSlug));
  if (rules.minFitScore != null) {
    conditions.push(sql`${growthProspects.fitScore} >= ${rules.minFitScore}`);
  }
  if (rules.cities?.length) {
    conditions.push(
      sql`(${sql.join(
        rules.cities.map((c) => ilike(growthProspects.city, `%${c}%`)),
        sql` or `,
      )})`,
    );
  }
  if (rules.equipmentKeywords?.length) {
    conditions.push(
      sql`(${sql.join(
        rules.equipmentKeywords.map((k) => ilike(growthProspects.equipmentNeeds, `%${k}%`)),
        sql` or `,
      )})`,
    );
  }

  const prospects = await db
    .select({ id: growthProspects.id, companyName: growthProspects.companyName })
    .from(growthProspects)
    .where(and(...conditions))
    .orderBy(sql`${growthProspects.fitScore} desc nulls last`, asc(growthProspects.companyName))
    .limit(limit);

  if (prospects.length === 0) return [];

  const prospectIds = prospects.map((p) => p.id);
  const contacts = await db
    .select({
      id: growthContactDetails.id,
      prospectId: growthContactDetails.prospectId,
      isPrimary: growthContactDetails.isPrimary,
    })
    .from(growthContactDetails)
    .where(
      and(
        eq(growthContactDetails.orgId, orgId),
        eq(growthContactDetails.kind, "EMAIL"),
        inArray(growthContactDetails.prospectId, prospectIds),
      ),
    );

  const byProspect = new Map<string, { id: string; isPrimary: boolean }[]>();
  for (const c of contacts) {
    const list = byProspect.get(c.prospectId) ?? [];
    list.push({ id: c.id, isPrimary: c.isPrimary });
    byProspect.set(c.prospectId, list);
  }

  const nameById = new Map(prospects.map((p) => [p.id, p.companyName]));
  const out: { prospectId: string; contactDetailId: string; companyName: string }[] = [];
  for (const prospectId of prospectIds) {
    const list = byProspect.get(prospectId);
    if (!list?.length) continue;
    const chosen = list.find((c) => c.isPrimary) ?? list[0]!;
    out.push({
      prospectId,
      contactDetailId: chosen.id,
      companyName: nameById.get(prospectId) ?? "",
    });
  }
  return out;
}

export async function enrollProspectsFromRules(
  orgId: string,
  campaignId: string,
  rules: ProspectSelectionRules,
): Promise<{ inserted: number; skipped: number; prospectsMatched: number; withEmail: number }> {
  const limit = rules.limit ?? 200;
  const conditions = [eq(growthProspects.orgId, orgId), isNull(growthProspects.mergedIntoId)];
  if (rules.excludeRejected !== false) conditions.push(isNull(growthProspects.rejectedAt));
  if (rules.sectorSlug) conditions.push(eq(growthProspects.sectorSlug, rules.sectorSlug));
  if (rules.minFitScore != null) conditions.push(gte(growthProspects.fitScore, rules.minFitScore));
  if (rules.cities?.length) {
    conditions.push(
      sql`(${sql.join(
        rules.cities.map((c) => ilike(growthProspects.city, `%${c}%`)),
        sql` or `,
      )})`,
    );
  }
  if (rules.equipmentKeywords?.length) {
    conditions.push(
      sql`(${sql.join(
        rules.equipmentKeywords.map((k) => ilike(growthProspects.equipmentNeeds, `%${k}%`)),
        sql` or `,
      )})`,
    );
  }
  const [prospectCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(growthProspects)
    .where(and(...conditions));
  const prospectsMatched = Number(prospectCount?.n ?? 0);

  const matches = await findProspectsForCampaignRules(orgId, rules);

  let inserted = 0;
  let skipped = 0;
  for (const item of matches) {
    const rows = await db
      .insert(growthCampaignRecipients)
      .values({
        orgId,
        campaignId,
        prospectId: item.prospectId,
        contactDetailId: item.contactDetailId,
      })
      .onConflictDoNothing({
        target: [growthCampaignRecipients.campaignId, growthCampaignRecipients.contactDetailId],
      })
      .returning({ id: growthCampaignRecipients.id });
    if (rows.length > 0) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped, prospectsMatched, withEmail: matches.length };
}

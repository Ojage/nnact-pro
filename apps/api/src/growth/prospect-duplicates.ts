import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db, growthContactDetails, growthProspects } from "@nnact/db";
import type { DuplicateCandidate } from "./duplicates.js";
import {
  normalizeCompany,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./send-policy.js";

/** Loads candidate records for duplicate detection within an org. */
export async function loadDuplicateCandidates(
  orgId: string,
  target: { email?: string | null; phone?: string | null; domain?: string | null; company?: string | null },
  countryCallingCode?: string | null,
): Promise<DuplicateCandidate[]> {
  const conditions = [];

  const email = normalizeEmail(target.email);
  const domain = normalizeDomain(target.domain);
  const phone = normalizePhone(target.phone, { countryCallingCode });
  const company = normalizeCompany(target.company);

  if (email) conditions.push(eq(growthContactDetails.normalizedValue, email));
  if (phone) conditions.push(eq(growthContactDetails.normalizedValue, phone));
  if (domain) conditions.push(eq(growthContactDetails.normalizedValue, domain));

  const rows = conditions.length
    ? await db
        .select({
          id: growthProspects.id,
          companyName: growthProspects.companyName,
          websiteDomain: growthProspects.websiteDomain,
          kind: growthContactDetails.kind,
          value: growthContactDetails.value,
        })
        .from(growthContactDetails)
        .innerJoin(growthProspects, eq(growthProspects.id, growthContactDetails.prospectId))
        .where(and(eq(growthContactDetails.orgId, orgId), isNull(growthProspects.mergedIntoId), or(...conditions)))
    : [];

  const byProspect = new Map<string, DuplicateCandidate>();
  for (const row of rows) {
    const existing = byProspect.get(row.id);
    if (existing) {
      existing.contacts?.push({ kind: row.kind, value: row.value });
    } else {
      byProspect.set(row.id, {
        id: row.id,
        companyName: row.companyName,
        websiteDomain: row.websiteDomain,
        contacts: [{ kind: row.kind, value: row.value }],
      });
    }
  }

  if (company) {
    const nameRows = await db
      .select({ id: growthProspects.id, companyName: growthProspects.companyName, websiteDomain: growthProspects.websiteDomain })
      .from(growthProspects)
      .where(
        and(
          eq(growthProspects.orgId, orgId),
          isNull(growthProspects.mergedIntoId),
          ilike(growthProspects.companyName, `%${company}%`),
        ),
      )
      .limit(50);
    for (const row of nameRows) {
      if (!byProspect.has(row.id)) {
        byProspect.set(row.id, { ...row, contacts: [] });
      }
    }
  }

  return [...byProspect.values()];
}

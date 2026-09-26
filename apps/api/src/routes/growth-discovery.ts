// Prospect discovery — CSV import, fit scoring, discovery runs (no invented emails).

import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  growthContactDetails,
  growthProspectDiscoveryRuns,
  growthProspects,
} from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { requireGrowthRead, requireGrowthWrite } from "../growth/access.js";
import { detectDuplicates, hasHardDuplicate } from "../growth/duplicates.js";
import { loadDuplicateCandidates } from "../growth/prospect-duplicates.js";
import { parseCsvProspects, scoreProspectFit } from "../growth/discovery.js";
import { normalizeEmail, normalizePhone } from "../growth/send-policy.js";

const uuid = z.string().uuid();

export async function growthDiscoveryRoutes(app: FastifyInstance) {
  app.get("/prospects/search", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const offset = Math.max(0, Number(q.offset ?? 0));

    const conditions = [eq(growthProspects.orgId, orgId), isNull(growthProspects.mergedIntoId)];
    if (q.excludeRejected === "true") conditions.push(isNull(growthProspects.rejectedAt));
    if (q.sectorSlug) conditions.push(eq(growthProspects.sectorSlug, q.sectorSlug));
    if (q.city) conditions.push(ilike(growthProspects.city, `%${q.city}%`));
    if (q.minFitScore) conditions.push(sql`${growthProspects.fitScore} >= ${Number(q.minFitScore)}`);
    if (q.q) {
      conditions.push(
        sql`(${growthProspects.companyName} ilike ${`%${q.q}%`} or ${growthProspects.equipmentNeeds} ilike ${`%${q.q}%`})`,
      );
    }

    const rows = await db
      .select()
      .from(growthProspects)
      .where(and(...conditions))
      .orderBy(desc(growthProspects.fitScore), desc(growthProspects.updatedAt))
      .limit(limit)
      .offset(offset);

    return rows.map((p) => ({
      id: p.id,
      companyName: p.companyName,
      city: p.city,
      country: p.country,
      sectorSlug: p.sectorSlug,
      fitScore: p.fitScore,
      fitSummary: p.fitSummary,
      fitEvidence: p.fitEvidence,
      emailVerificationStatus: p.emailVerificationStatus,
      rejectedAt: p.rejectedAt?.toISOString() ?? null,
      rejectReason: p.rejectReason,
      lifecycle: p.lifecycle,
      source: p.source,
      createdAt: p.createdAt.toISOString(),
    }));
  });

  app.post("/prospects/import/csv", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { csv, countryCallingCode } = z
      .object({ csv: z.string().min(1).max(2_000_000), countryCallingCode: z.string().optional() })
      .parse(req.body);

    const parsed = parseCsvProspects(csv);
    let created = 0;
    let skipped = 0;
    const results: { companyName: string; status: string; reason?: string }[] = [];

    for (const row of parsed) {
      const fit = scoreProspectFit({
        companyName: row.companyName,
        sectorSlug: row.sectorSlug,
        city: row.city,
        country: row.country,
        industry: row.industry,
        equipmentNeeds: row.equipmentNeeds,
      });

      const candidates = await loadDuplicateCandidates(
        orgId,
        {
          company: row.companyName,
          email: row.email,
          phone: row.phone,
          domain: row.websiteDomain,
        },
        countryCallingCode,
      );
      const dup = detectDuplicates(
        {
          company: row.companyName,
          email: row.email,
          phone: row.phone,
          domain: row.websiteDomain,
          countryCallingCode,
        },
        candidates,
      );
      if (hasHardDuplicate(dup)) {
        skipped += 1;
        results.push({ companyName: row.companyName, status: "skipped", reason: "duplicate" });
        continue;
      }

      const [prospect] = await db
        .insert(growthProspects)
        .values({
          orgId,
          companyName: row.companyName,
          websiteDomain: row.websiteDomain,
          industry: row.industry,
          city: row.city,
          country: row.country ?? "Cameroon",
          equipmentNeeds: row.equipmentNeeds,
          sectorSlug: row.sectorSlug,
          fitScore: fit.score,
          fitSummary: fit.summary,
          fitEvidence: fit.evidence,
          emailVerificationStatus: row.email ? "UNVERIFIED" : "MISSING",
          source: row.source ?? "IMPORT",
          sourceDetail: "csv_import",
          lastResearchedAt: new Date(),
          createdBy: claims.userId,
        })
        .returning({ id: growthProspects.id });

      if (row.email) {
        const normalized = normalizeEmail(row.email);
        if (normalized) {
          await db.insert(growthContactDetails).values({
            orgId,
            prospectId: prospect!.id,
            kind: "EMAIL",
            label: row.contactLabel ?? "Contact",
            value: row.email,
            normalizedValue: normalized,
            isPrimary: true,
            source: "csv_import",
          });
        }
      }
      if (row.phone) {
        const normalized = normalizePhone(row.phone, { countryCallingCode });
        if (normalized) {
          await db.insert(growthContactDetails).values({
            orgId,
            prospectId: prospect!.id,
            kind: "PHONE",
            value: row.phone,
            normalizedValue: normalized,
            source: "csv_import",
          });
        }
      }

      created += 1;
      results.push({ companyName: row.companyName, status: "created" });
    }

    return reply.code(201).send({ created, skipped, results });
  });

  app.post("/prospects/:id/reject", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const id = uuid.parse((req.params as { id: string }).id);
    const { reason } = z.object({ reason: z.string().trim().min(1).max(2000) }).parse(req.body);
    const [existing] = await db
      .select({ fitEvidence: growthProspects.fitEvidence })
      .from(growthProspects)
      .where(and(eq(growthProspects.orgId, orgId), eq(growthProspects.id, id)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "not found" });
    const prior = Array.isArray(existing.fitEvidence) ? existing.fitEvidence : [];
    const fitEvidence = [...prior, { type: "rejected", detail: reason, at: new Date().toISOString() }];
    const [row] = await db
      .update(growthProspects)
      .set({
        rejectedAt: new Date(),
        rejectReason: reason,
        lifecycle: "DO_NOT_CONTACT",
        fitEvidence,
        updatedAt: new Date(),
      })
      .where(and(eq(growthProspects.orgId, orgId), eq(growthProspects.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/discovery/run", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z
      .object({
        sectorSlug: z.string().trim().max(80),
        city: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
      })
      .parse(req.body);

    const [run] = await db
      .insert(growthProspectDiscoveryRuns)
      .values({
        orgId,
        sectorSlug: body.sectorSlug,
        city: body.city,
        country: body.country ?? "Cameroon",
        status: "COMPLETED",
        notes:
          "Discovery run scored existing prospects matching sector/city. No contact details invented. Use CSV import or licensed providers for new companies.",
        createdBy: claims.userId,
        finishedAt: new Date(),
      })
      .returning();

    const existing = await db
      .select()
      .from(growthProspects)
      .where(
        and(
          eq(growthProspects.orgId, orgId),
          isNull(growthProspects.mergedIntoId),
          isNull(growthProspects.rejectedAt),
          body.city ? ilike(growthProspects.city, `%${body.city}%`) : sql`true`,
        ),
      )
      .limit(500);

    let updated = 0;
    for (const p of existing) {
      const fit = scoreProspectFit({
        companyName: p.companyName,
        sectorSlug: body.sectorSlug,
        city: p.city ?? body.city,
        country: p.country ?? body.country,
        industry: p.industry ?? undefined,
        equipmentNeeds: p.equipmentNeeds ?? undefined,
      });
      await db
        .update(growthProspects)
        .set({
          sectorSlug: body.sectorSlug,
          fitScore: fit.score,
          fitSummary: fit.summary,
          fitEvidence: fit.evidence,
          lastResearchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(growthProspects.id, p.id));
      updated += 1;
    }

    await db
      .update(growthProspectDiscoveryRuns)
      .set({ prospectsSeen: existing.length, prospectsCreated: 0, notes: `${updated} prospects rescored` })
      .where(eq(growthProspectDiscoveryRuns.id, run!.id));

    return {
      runId: run!.id,
      prospectsSeen: existing.length,
      prospectsRescored: updated,
      message: "Rescored existing prospects. Import CSV or connect a licensed provider to add new companies.",
    };
  });
}

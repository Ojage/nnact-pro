import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, growthExpleeImportRuns, growthProspects } from "@nnact/db";
import { resolveOrgId } from "./org.js";
import { requireGrowthOwner, requireGrowthRead } from "../growth/access.js";
import { fetchExpleeProspects } from "../growth/explee-import.js";

export async function growthImportRoutes(app: FastifyInstance) {
  app.get("/import/explee/preview", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const fetched = await fetchExpleeProspects();
    return {
      source: fetched.source,
      error: fetched.error,
      rows: fetched.rows,
      readOnly: true,
    };
  });

  app.post("/import/explee/run", async (req, reply) => {
    const claims = await requireGrowthOwner(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const body = z.object({ commit: z.boolean().optional() }).parse(req.body ?? {});

    const [run] = await db
      .insert(growthExpleeImportRuns)
      .values({
        orgId,
        status: "RUNNING",
        previewOnly: !body.commit,
        createdBy: claims.userId,
      })
      .returning();

    const fetched = await fetchExpleeProspects();
    if (fetched.error && fetched.rows.length === 0) {
      await db
        .update(growthExpleeImportRuns)
        .set({ status: "FAILED", error: fetched.error, finishedAt: new Date() })
        .where(eq(growthExpleeImportRuns.id, run!.id));
      return reply.code(502).send({ error: fetched.error, runId: run!.id });
    }

    let imported = 0;
    let skipped = 0;
    if (body.commit) {
      for (const row of fetched.rows) {
        await db.insert(growthProspects).values({
          orgId,
          companyName: row.companyName,
          websiteDomain: row.websiteDomain,
          industry: row.industry,
          city: row.city,
          notes: row.notes,
          source: "IMPORT",
          sourceDetail: "explee_read_only",
          createdBy: claims.userId,
        });
        imported += 1;
      }
    }

    await db
      .update(growthExpleeImportRuns)
      .set({
        status: "COMPLETED",
        rowsSeen: fetched.rows.length,
        rowsImported: imported,
        rowsSkipped: skipped,
        finishedAt: new Date(),
      })
      .where(eq(growthExpleeImportRuns.id, run!.id));

    return {
      runId: run!.id,
      previewOnly: !body.commit,
      rowsSeen: fetched.rows.length,
      rowsImported: imported,
      rowsSkipped: skipped,
      source: fetched.source,
    };
  });
}

import { and, eq, sql } from "drizzle-orm";
import { db, equipmentModels, users } from "./index.js";
import { NNACT_ORG_ID } from "./seed/ids.js";
import { NNACT_KNOWLEDGE_MODELS } from "./seed/nnact-data.js";

async function main() {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, NNACT_ORG_ID), eq(users.role, "owner")))
    .limit(1);

  for (const model of NNACT_KNOWLEDGE_MODELS) {
    await db
      .insert(equipmentModels)
      .values({
        id: model.id,
        orgId: NNACT_ORG_ID,
        manufacturer: model.manufacturer,
        brand: model.manufacturer,
        modelNumber: model.modelNumber,
        modelName: model.modelName,
        category: model.category,
        normalizedIdentifier: model.normalizedIdentifier,
        createdBy: owner?.id ?? null,
      })
      .onConflictDoUpdate({
        target: equipmentModels.id,
        set: {
          manufacturer: model.manufacturer,
          modelNumber: model.modelNumber,
          modelName: model.modelName,
          category: model.category,
          normalizedIdentifier: model.normalizedIdentifier,
          updatedAt: new Date(),
        },
      });
  }

  const [verify] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(equipmentModels)
    .where(eq(equipmentModels.orgId, NNACT_ORG_ID));

  console.log(
    `seed:nnact-models → ${NNACT_KNOWLEDGE_MODELS.length}/${verify.count} equipment models upserted for org ${NNACT_ORG_ID}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
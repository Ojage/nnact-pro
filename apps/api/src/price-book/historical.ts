import { and, eq } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  estimateOptionLineItems,
  expenses,
  invoiceLineItems,
  lineItems,
  modelParts,
  partProcurementRecords,
  priceBookCategories,
  priceBookItems,
  priceObservations,
  supplierBillLines,
  supplierBills,
} from "@nnact/db";
import {
  HISTORICAL_CONFIDENCE_CAP,
  PRICE_BOOK_DEFAULT_FRESHNESS_DAYS,
  type HistoricalImportReport,
  type HistoricalImportRow,
} from "@nnact/shared";
import { matchItemByName } from "./pricing.js";

type RawRow = Omit<HistoricalImportRow, "matchedItemId" | "suggestedName">;

async function defaultCategoryId(orgId: string): Promise<string> {
  const [existing] = await db
    .select({ id: priceBookCategories.id })
    .from(priceBookCategories)
    .where(eq(priceBookCategories.orgId, orgId))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(priceBookCategories)
    .values({
      orgId,
      name: "Imported",
      freshnessDays: PRICE_BOOK_DEFAULT_FRESHNESS_DAYS,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  const [fallback] = await db
    .select({ id: priceBookCategories.id })
    .from(priceBookCategories)
    .where(eq(priceBookCategories.orgId, orgId))
    .limit(1);
  return fallback.id;
}

async function collect(orgId: string): Promise<RawRow[]> {
  const rows: RawRow[] = [];

  const [expenseRows, billRows, jobLines, optionLines, invoiceRows, procurementRows] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.orgId, orgId)),
    db.select({ line: supplierBillLines, bill: supplierBills })
      .from(supplierBillLines)
      .innerJoin(supplierBills, eq(supplierBills.id, supplierBillLines.billId))
      .where(eq(supplierBillLines.orgId, orgId)),
    db.select().from(lineItems).where(eq(lineItems.orgId, orgId)),
    db.select().from(estimateOptionLineItems).where(eq(estimateOptionLineItems.orgId, orgId)),
    db.select().from(invoiceLineItems).where(eq(invoiceLineItems.orgId, orgId)),
    db.select({ record: partProcurementRecords, part: modelParts })
      .from(partProcurementRecords)
      .innerJoin(modelParts, eq(modelParts.id, partProcurementRecords.modelPartId))
      .where(eq(partProcurementRecords.orgId, orgId)),
  ]);

  for (const expense of expenseRows) {
    rows.push({
      sourceTable: "expenses",
      sourceId: expense.id,
      description: expense.title,
      amountCents: expense.amountCents,
      observedAt: (expense.submittedAt ?? expense.createdAt).toISOString(),
      shopName: expense.receiptUrls[0] ?? null,
    });
  }
  for (const { line, bill } of billRows) {
    rows.push({
      sourceTable: "supplier_bill_lines",
      sourceId: line.id,
      description: line.description,
      amountCents: Math.round(line.amountCents / Math.max(1, line.quantity)),
      observedAt: bill.issueDate.toISOString(),
      shopName: bill.supplierName,
    });
  }
  for (const line of jobLines) {
    rows.push({
      sourceTable: "line_items",
      sourceId: line.id,
      description: line.description,
      amountCents: line.unitPrice,
      observedAt: line.createdAt.toISOString(),
      shopName: null,
    });
  }
  for (const line of optionLines) {
    rows.push({
      sourceTable: "estimate_option_line_items",
      sourceId: line.id,
      description: line.description,
      amountCents: line.unitPrice,
      observedAt: line.createdAt.toISOString(),
      shopName: null,
    });
  }
  for (const line of invoiceRows) {
    rows.push({
      sourceTable: "invoice_line_items",
      sourceId: line.id,
      description: line.description,
      amountCents: line.unitPrice,
      observedAt: line.createdAt.toISOString(),
      shopName: null,
    });
  }
  for (const { record, part } of procurementRows) {
    rows.push({
      sourceTable: "part_procurement_records",
      sourceId: record.id,
      description: part.partName,
      amountCents: Math.round(record.costCents / Math.max(1, record.quantity)),
      observedAt: record.purchasedAt.toISOString(),
      shopName: record.supplierName,
    });
  }
  return rows;
}

/** Dry-run by default. Imported prices are historical, capped and never fresh. */
export async function importHistoricalPrices(orgId: string, dryRun: boolean): Promise<HistoricalImportReport> {
  const [raw, items] = await Promise.all([
    collect(orgId),
    db.select().from(priceBookItems).where(eq(priceBookItems.orgId, orgId)),
  ]);
  const mapped = raw.map((row) => {
    const match = matchItemByName(items, row.description);
    return { ...row, matchedItemId: match?.id ?? null, suggestedName: match?.canonicalName ?? row.description.trim() };
  });
  const matched = mapped.filter((row) => row.matchedItemId);
  const samples = [...matched].sort(() => Math.random() - 0.5).slice(0, 30);
  const zeroOrMissingPrice = mapped.filter((row) => row.amountCents <= 0).length;
  const base: HistoricalImportReport = {
    dryRun,
    scanned: mapped.length,
    mapped: matched.length,
    unmapped: mapped.length - matched.length,
    unmappedShare: mapped.length ? Math.round(((mapped.length - matched.length) * 100) / mapped.length) : 0,
    coverageShare: mapped.length ? Math.round((matched.length * 100) / mapped.length) : 0,
    zeroOrMissingPrice,
    samples,
    inserted: 0,
  };
  if (dryRun) return base;

  const categoryId = await defaultCategoryId(orgId);
  const itemBySuggested = new Map(items.map((item) => [item.canonicalName.toLowerCase(), item.id]));
  let inserted = 0;
  for (const row of mapped) {
    if (row.amountCents <= 0) continue;
    let itemId = row.matchedItemId;
    if (!itemId) {
      const key = row.suggestedName.toLowerCase().slice(0, 200);
      itemId = itemBySuggested.get(key) ?? null;
      if (!itemId) {
        const [created] = await db
          .insert(priceBookItems)
          .values({
            orgId,
            categoryId,
            canonicalName: row.suggestedName.slice(0, 200),
            unit: "piece",
            aliases: { en: [row.suggestedName.slice(0, 200)], fr: [] },
            suggested: true,
          })
          .onConflictDoNothing()
          .returning();
        itemId = created?.id ?? null;
        if (itemId) itemBySuggested.set(key, itemId);
      }
    }
    if (!itemId) continue;
    const [existing] = await db
      .select({ id: priceObservations.id })
      .from(priceObservations)
      .where(
        and(
          eq(priceObservations.orgId, orgId),
          eq(priceObservations.itemId, itemId),
          eq(priceObservations.amountCents, row.amountCents),
          eq(priceObservations.source, "historical"),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(priceObservations).values({
      orgId,
      itemId,
      amountCents: row.amountCents,
      shopName: row.shopName,
      source: "historical",
      status: "confirmed",
      observedAt: new Date(row.observedAt),
      confidence: HISTORICAL_CONFIDENCE_CAP,
    });
    inserted += 1;
  }
  return { ...base, inserted };
}

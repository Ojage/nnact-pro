import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  advanceSettlements,
  billPayments,
  budgets,
  budgetLines,
  cashAdvances,
  costCenters,
  db,
  expenseCategories,
  expenses,
  jobLineItemsFinance,
  pettyCashFunds,
  pettyCashTransactions,
  reimbursements,
  recurringBills,
  supplierBillLines,
  supplierBills,
} from "../index.js";
import { NNACT_ORG_ID, NNACT_USER_IDS, nnactJobId } from "./ids.js";
import { xaf } from "./nnact-data.js";

function daysAgo(days: number, hour = 9): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function daysAhead(days: number, hour = 9): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

const CATEGORIES = [
  "Spare Parts",
  "Consumables",
  "Fuels & Power",
  "Travel & Transport",
  "Tools & Equipment",
  "Shop & Utilities",
  "Licenses & Fees",
] as const;

const CENTERS = [
  { name: "Residential Care & Repair", code: "RES" },
  { name: "HVAC & Cold-Chain", code: "HVAC" },
  { name: "Electrical & Solar", code: "ELEC" },
  { name: "Generators & Power", code: "GEN" },
  { name: "Office & Administration", code: "ADMIN" },
] as const;

export async function seedNnactFinance(): Promise<void> {
  const owner = NNACT_USER_IDS.owner;
  const claudia = NNACT_USER_IDS.financeClaudia;
  const emmanuel = NNACT_USER_IDS.seniorEmmanuel;
  const frankline = NNACT_USER_IDS.techFrankline;
  const delphine = NNACT_USER_IDS.techDelphine;
  const junior = NNACT_USER_IDS.techJunior;
  const rita = NNACT_USER_IDS.techRita;
  const pascal = NNACT_USER_IDS.techPascal;

  const categoryIds = new Map<string, string>();
  for (const name of CATEGORIES) categoryIds.set(name, randomUUID());

  const centerIds = new Map<string, string>();
  for (const center of CENTERS) centerIds.set(center.name, randomUUID());

  const period = new Date().toISOString().slice(0, 7);

  await db.transaction(async (tx) => {
    // Reset the finance domain for the demo org (deterministic, idempotent).
    for (const table of [
      advanceSettlements,
      billPayments,
      supplierBillLines,
      budgetLines,
      pettyCashTransactions,
      jobLineItemsFinance,
    ]) {
      await tx.delete(table).where(sql`${table.orgId} = ${NNACT_ORG_ID}`);
    }
    for (const table of [
      expenses,
      supplierBills,
      cashAdvances,
      reimbursements,
      pettyCashFunds,
      budgets,
      recurringBills,
    ]) {
      await tx.delete(table).where(sql`${table.orgId} = ${NNACT_ORG_ID}`);
    }
    for (const table of [expenseCategories, costCenters]) {
      await tx.delete(table).where(sql`${table.orgId} = ${NNACT_ORG_ID}`);
    }

    // ── Lookups ─────────────────────────────────────────────────────────────
    for (const name of CATEGORIES) {
      await tx.insert(expenseCategories).values({
        id: categoryIds.get(name)!,
        orgId: NNACT_ORG_ID,
        name,
        createdBy: owner,
        createdAt: daysAgo(120),
      });
    }
    for (const center of CENTERS) {
      await tx.insert(costCenters).values({
        id: centerIds.get(center.name)!,
        orgId: NNACT_ORG_ID,
        name: center.name,
        code: center.code,
        description: `${center.name} cost pool`,
        createdBy: owner,
        createdAt: daysAgo(120),
      });
    }

    // ── Budgets (current month) ─────────────────────────────────────────────
    const budgetId = randomUUID();
    const spareParts = categoryIds.get("Spare Parts")!;
    const fuels = categoryIds.get("Fuels & Power")!;
    const travel = categoryIds.get("Travel & Transport")!;
    const tools = categoryIds.get("Tools & Equipment")!;

    await tx.insert(budgets).values({
      id: budgetId,
      orgId: NNACT_ORG_ID,
      period,
      label: `${period} operating budget`,
      costCenterId: null,
      createdBy: owner,
      createdAt: daysAgo(20),
    });
const budgetPlans = [
    [spareParts, xaf(350000)],
    [fuels, xaf(180000)],
    [travel, xaf(150000)],
    [tools, xaf(90000)],
  ] as const;
    for (const [categoryId, plannedCents] of budgetPlans) {
      await tx.insert(budgetLines).values({
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        budgetId,
        categoryId,
        plannedCents,
      });
    }

    // ── Petty cash ──────────────────────────────────────────────────────────
    const kittyId = randomUUID();
    await tx.insert(pettyCashFunds).values({
      id: kittyId,
      orgId: NNACT_ORG_ID,
      name: "Field kitty (Buea office)",
      custodianId: claudia,
      openingBalanceCents: xaf(100000),
      currentBalanceCents: xaf(87500),
      status: "active",
      createdAt: daysAgo(90),
    });
    await tx.insert(pettyCashTransactions).values([
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        fundId: kittyId,
        kind: "DEPOSIT",
        amountCents: xaf(100000),
        description: "Opening float",
        happenedAt: daysAgo(90),
        createdBy: claudia,
        createdAt: daysAgo(90),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        fundId: kittyId,
        kind: "EXPENSE",
        amountCents: xaf(12500),
        categoryId: travel,
        costCenterId: centerIds.get("Office & Administration")!,
        description: "Courier from office to Molyko workshop",
        happenedAt: daysAgo(12, 14),
        createdBy: claudia,
        createdAt: daysAgo(12),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        fundId: kittyId,
        kind: "TOP_UP",
        amountCents: xaf(50000),
        description: "Float replenishment before week of site visits",
        happenedAt: daysAgo(8, 10),
        createdBy: claudia,
        createdAt: daysAgo(8),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        fundId: kittyId,
        kind: "EXPENSE",
        amountCents: xaf(50000),
        categoryId: fuels,
        costCenterId: centerIds.get("Generators & Power")!,
        description: "Generator fuel — Bokwango residence (4 cans)",
        happenedAt: daysAgo(3, 15),
        createdBy: claudia,
        createdAt: daysAgo(3),
      },
    ]);

    // ── Expenses (employee cash-outs) ───────────────────────────────────────
    const expensesSeed = [
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000001",
        employeeId: frankline,
        submittedById: frankline,
        categoryId: spareParts,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: nnactJobId(13),
        title: "AC capacitor and fan blade — Molyko",
        description: "Bought parts for the outdoor unit breaker trip job.",
        amountCents: xaf(28000),
        momoFeeCents: xaf(400),
        paymentMethod: "CASH" as const,
        status: "APPROVED" as const,
        submittedAt: daysAgo(2, 11),
        approvedBy: claudia,
        approvedAt: daysAgo(1, 9),
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000002",
        employeeId: rita,
        submittedById: rita,
        categoryId: tools,
        costCenterId: centerIds.get("Electrical & Solar")!,
        jobId: nnactJobId(16),
        title: "Inverter battery terminal lugs",
        description: "Replacement lugs and heat-shrink for battery bank.",
        amountCents: xaf(35000),
        momoFeeCents: 0,
        paymentMethod: "MTN_MOBILE_MONEY" as const,
        status: "SUBMITTED" as const,
        submittedAt: daysAgo(1, 16),
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000003",
        employeeId: pascal,
        submittedById: pascal,
        categoryId: fuels,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: nnactJobId(15),
        title: "Refrigerant recovery cylinder deposit",
        description: "R134a cylinder deposit for pharmacy fridge repair.",
        amountCents: xaf(45000),
        momoFeeCents: xaf(700),
        paymentMethod: "ORANGE_MONEY" as const,
        status: "SUBMITTED" as const,
        submittedAt: daysAgo(1, 12),
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000004",
        employeeId: delphine,
        submittedById: delphine,
        categoryId: spareParts,
        costCenterId: centerIds.get("Residential Care & Repair")!,
        jobId: nnactJobId(22),
        title: "Washer drain hose and clamps",
        description: "Replacement drain hose for follow-up visit.",
        amountCents: xaf(12500),
        momoFeeCents: 0,
        paymentMethod: "CASH" as const,
        status: "DRAFT" as const,
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000005",
        employeeId: junior,
        submittedById: junior,
        categoryId: travel,
        costCenterId: centerIds.get("Generators & Power")!,
        jobId: nnactJobId(20),
        title: "Transport — Bokwango generator PM",
        description: "Round trip bike transport for generator service kit.",
        amountCents: xaf(6000),
        momoFeeCents: 0,
        paymentMethod: "CASH" as const,
        status: "PAID" as const,
        submittedAt: daysAgo(9, 14),
        approvedBy: claudia,
        approvedAt: daysAgo(8, 8),
        paidAt: daysAgo(7, 10),
        paidBy: claudia,
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000006",
        employeeId: emmanuel,
        submittedById: emmanuel,
        categoryId: tools,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: nnactJobId(11),
        title: "Cold-room door gasket kit",
        description: "Replacement gasket for processing plant cold room.",
        amountCents: xaf(68000),
        momoFeeCents: xaf(1000),
        paymentMethod: "BANK_TRANSFER" as const,
        status: "PAID" as const,
        submittedAt: daysAgo(12, 10),
        approvedBy: claudia,
        approvedAt: daysAgo(11, 9),
        paidAt: daysAgo(10, 10),
        paidBy: claudia,
      },
      {
        id: randomUUID(),
        number: "NNACT/EXP/2026/000007",
        employeeId: frankline,
        submittedById: frankline,
        categoryId: travel,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: nnactJobId(14),
        title: "Fuel — Bomaka seasonal servicing loop",
        description: "Two tanks for the service vehicle during PM route.",
        amountCents: xaf(28000),
        momoFeeCents: 0,
        paymentMethod: "CASH" as const,
        status: "REJECTED" as const,
        submittedAt: daysAgo(5, 9),
        rejectionReason: "Missing receipt photo — resubmit with the fuel receipt.",
        approvedBy: claudia,
        approvedAt: daysAgo(4, 15),
      },
    ] as const;
    for (const row of expensesSeed) {
      await tx.insert(expenses).values({ ...row, orgId: NNACT_ORG_ID, receiptUrls: [], createdAt: daysAgo(4) });
    }

    // ── Supplier bills + payments ───────────────────────────────────────────
    const billRows = [
      {
        id: randomUUID(),
        number: "NNACT/BILL/2026/000001",
        supplierName: "Frigoref Cooling Supplies",
        supplierReference: "INV-8841",
        categoryId: spareParts,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: null,
        issueDate: daysAgo(25),
        dueDate: daysAgo(0, 17),
        status: "OVERDUE" as const,
        subTotalCents: xaf(385000),
        taxCents: xaf(77000),
        totalCents: xaf(462000),
        paidCents: xaf(0),
        notes: "Compressor and condenser fans for restock.",
        approvedBy: claudia,
        approvedAt: daysAgo(24, 9),
        createdAt: daysAgo(25),
      },
      {
        id: randomUUID(),
        number: "NNACT/BILL/2026/000002",
        supplierName: "ENEO (electric utility)",
        supplierReference: "ENEO-2026-03-011",
        categoryId: null,
        costCenterId: centerIds.get("Office & Administration")!,
        jobId: null,
        issueDate: daysAgo(10),
        dueDate: daysAhead(5),
        status: "APPROVED" as const,
        subTotalCents: xaf(96000),
        taxCents: xaf(0),
        totalCents: xaf(96000),
        paidCents: xaf(0),
        notes: "Workshop electricity.",
        approvedBy: claudia,
        approvedAt: daysAgo(9, 10),
        createdAt: daysAgo(10),
      },
      {
        id: randomUUID(),
        number: "NNACT/BILL/2026/000003",
        supplierName: "Hahn Refrigeration Supplies",
        supplierReference: "HS/2026/0391",
        categoryId: spareParts,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        jobId: nnactJobId(11),
        issueDate: daysAgo(18),
        dueDate: daysAgo(12),
        status: "PARTIALLY_PAID" as const,
        subTotalCents: xaf(120000),
        taxCents: xaf(12000),
        totalCents: xaf(132000),
        paidCents: xaf(100000),
        notes: "Cold-room evaporator coils.",
        approvedBy: claudia,
        approvedAt: daysAgo(17, 9),
        createdAt: daysAgo(18),
      },
      {
        id: randomUUID(),
        number: "NNACT/BILL/2026/000004",
        supplierName: "Camitech Tools",
        supplierReference: "CT-5512",
        categoryId: tools,
        costCenterId: centerIds.get("Office & Administration")!,
        jobId: null,
        issueDate: daysAgo(30),
        dueDate: daysAgo(15),
        status: "PAID" as const,
        subTotalCents: xaf(240000),
        taxCents: xaf(0),
        totalCents: xaf(240000),
        paidCents: xaf(240000),
        notes: "Digital manifold gauges.",
        approvedBy: claudia,
        approvedAt: daysAgo(29, 9),
        createdAt: daysAgo(30),
      },
      {
        id: randomUUID(),
        number: "NNACT/BILL/2026/000005",
        supplierName: "Sahel Oils Cameroon",
        supplierReference: "SO-778",
        categoryId: null,
        costCenterId: centerIds.get("Generators & Power")!,
        jobId: null,
        issueDate: daysAgo(3),
        dueDate: daysAhead(9),
        status: "RECEIVED" as const,
        subTotalCents: xaf(64000),
        taxCents: xaf(0),
        totalCents: xaf(64000),
        paidCents: xaf(0),
        notes: "Engine oil and filters restock.",
        createdAt: daysAgo(3),
      },
    ] as const;
    for (const row of billRows) {
      await tx.insert(supplierBills).values({ ...row, orgId: NNACT_ORG_ID, updatedAt: row.createdAt, version: 2 });
      await tx.insert(supplierBillLines).values({
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        billId: row.id,
        description: row.notes ?? row.supplierReference ?? "Supplies",
        quantity: 1,
        unitPriceCents: row.totalCents,
        amountCents: row.totalCents,
      });
    }
    await tx.insert(billPayments).values([
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        billId: billRows[2].id,
        amountCents: xaf(100000),
        method: "BANK_TRANSFER" as const,
        reference: "TRF-77012",
        paidAt: daysAgo(6, 11),
        paidBy: claudia,
        createdAt: daysAgo(6),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        billId: billRows[3].id,
        amountCents: xaf(240000),
        method: "BANK_TRANSFER" as const,
        reference: "TRF-76888",
        paidAt: daysAgo(14, 12),
        paidBy: claudia,
        createdAt: daysAgo(14),
      },
    ]);

    // ── Recurring bills ─────────────────────────────────────────────────────
    await tx.insert(recurringBills).values([
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        supplierName: "Camtel Internet Services",
        supplierReference: "CIS-4500",
        categoryId: null,
        costCenterId: centerIds.get("Office & Administration")!,
        jobId: null,
        frequency: "MONTHLY" as const,
        dayOfMonth: 1,
        nextDueOn: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        subTotalCents: xaf(45000),
        taxCents: xaf(0),
        totalCents: xaf(45000),
        notes: "Office broadband.",
        createdBy: claudia,
        createdAt: daysAgo(60),
      },
    ]);

    // ── Cash advances ───────────────────────────────────────────────────────
    const advanceRows = [
      {
        id: randomUUID(),
        number: "NNACT/ADV/2026/000001",
        employeeId: emmanuel,
        amountCents: xaf(150000),
        reason: "Materials for hotel lobby HVAC audit follow-through",
        requiredForJobId: nnactJobId(7),
        categoryId: spareParts,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        status: "DISBURSED" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(8, 10),
        disbursedBy: claudia,
        disbursedAt: daysAgo(7, 11),
        settlementDueAt: daysAhead(13, 17),
        settledCents: xaf(0),
        createdAt: daysAgo(9),
      },
      {
        id: randomUUID(),
        number: "NNACT/ADV/2026/000002",
        employeeId: rita,
        amountCents: xaf(80000),
        reason: "Fuel and lugs for inverter callbacks (Molyko/Bokwango)",
        requiredForJobId: nnactJobId(16),
        categoryId: fuels,
        costCenterId: centerIds.get("Electrical & Solar")!,
        status: "APPROVED" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(2, 9),
        settlementDueAt: daysAhead(23, 17),
        settledCents: xaf(0),
        createdAt: daysAgo(3),
      },
      {
        id: randomUUID(),
        number: "NNACT/ADV/2026/000003",
        employeeId: pascal,
        amountCents: xaf(100000),
        reason: "Cold-room refrigerant cylinder deposit",
        requiredForJobId: nnactJobId(11),
        categoryId: fuels,
        costCenterId: centerIds.get("HVAC & Cold-Chain")!,
        status: "PARTIALLY_SETTLED" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(20, 9),
        disbursedBy: claudia,
        disbursedAt: daysAgo(19, 10),
        settlementDueAt: daysAgo(2, 17),
        settledCents: xaf(45000),
        createdAt: daysAgo(21),
      },
      {
        id: randomUUID(),
        number: "NNACT/ADV/2026/000004",
        employeeId: junior,
        amountCents: xaf(60000),
        reason: "Generator PM consumables — Gunner Hostel",
        requiredForJobId: nnactJobId(20),
        categoryId: null,
        costCenterId: centerIds.get("Generators & Power")!,
        status: "SETTLED" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(16, 9),
        disbursedBy: claudia,
        disbursedAt: daysAgo(15, 10),
        settlementDueAt: daysAgo(1, 17),
        settledCents: xaf(60000),
        createdAt: daysAgo(17),
      },
    ] as const;
    for (const row of advanceRows) {
      await tx.insert(cashAdvances).values({ ...row, orgId: NNACT_ORG_ID, notes: null, cancelReason: null, version: 1, updatedAt: row.createdAt });
    }
    await tx.insert(advanceSettlements).values([
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        advanceId: advanceRows[2].id,
        settledCents: xaf(45000),
        description: "Refrigerant cylinder deposit refunded on return",
        expenseIds: [],
        settledBy: claudia,
        settledAt: daysAgo(2, 14),
        createdAt: daysAgo(2),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        advanceId: advanceRows[3].id,
        settledCents: xaf(60000),
        description: "Consumables receipts reconciled at close-out",
        expenseIds: [],
        settledBy: claudia,
        settledAt: daysAgo(1, 12),
        createdAt: daysAgo(1),
      },
    ]);

    // ── Reimbursements ──────────────────────────────────────────────────────
await tx.insert(reimbursements).values([
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        number: "NNACT/RMB/2026/000001",
        employeeId: delphine,
        amountCents: xaf(21000),
        title: "Office printer toner",
        description: "Bought toner out of pocket; office stock was empty.",
        jobId: null,
        receiptUrls: [],
        status: "SUBMITTED" as const,
        createdAt: daysAgo(1, 13),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        number: "NNACT/RMB/2026/000002",
        employeeId: frankline,
        amountCents: xaf(36000),
        title: "Bike fuel round — Great Soppo and Molyko",
        description: "Fuel for today's two AM calls.",
        jobId: nnactJobId(21),
        receiptUrls: [],
        status: "APPROVED" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(1, 11),
        createdAt: daysAgo(2, 18),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        number: "NNACT/RMB/2026/000003",
        employeeId: rita,
        amountCents: xaf(15000),
        title: "Battery terminal cleaner",
        description: "Chemical cleaner and wire brushes.",
        jobId: nnactJobId(24),
        receiptUrls: [],
        status: "REJECTED" as const,
        rejectionReason: "Please re-tag under Tools & Equipment and attach the shop receipt.",
        approvedBy: claudia,
        approvedAt: daysAgo(4, 16),
        createdAt: daysAgo(5, 14),
      },
      {
        id: randomUUID(),
        orgId: NNACT_ORG_ID,
        number: "NNACT/RMB/2026/000004",
        employeeId: pascal,
        amountCents: xaf(72000),
        title: "Pharmacy fridge compressor",
        description: "Emergency compressor swap — pharmacy cold chain.",
        jobId: nnactJobId(15),
        receiptUrls: [],
        status: "PAID" as const,
        approvedBy: claudia,
        approvedAt: daysAgo(9, 9),
        paidAt: daysAgo(8, 12),
        paidBy: claudia,
        createdAt: daysAgo(11, 16),
      },
    ]);
  });
}

export async function verifyNnactFinanceSeed(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    expenseCategories: 0,
    costCenters: 0,
    budgets: 0,
    budgetLines: 0,
    expenses: 0,
    supplierBills: 0,
    supplierBillLines: 0,
    billPayments: 0,
    recurringBills: 0,
    cashAdvances: 0,
    advanceSettlements: 0,
    reimbursements: 0,
    pettyCashFunds: 0,
    pettyCashTransactions: 0,
  };
  const [org] = await db.select().from(expenseCategories).where(sql`${expenseCategories.orgId} = ${NNACT_ORG_ID}`).limit(1);
  if (!org) return counts;
  counts.expenseCategories = (await db.select().from(expenseCategories).where(sql`${expenseCategories.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.costCenters = (await db.select().from(costCenters).where(sql`${costCenters.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.budgets = (await db.select().from(budgets).where(sql`${budgets.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.budgetLines = (await db.select().from(budgetLines).where(sql`${budgetLines.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.expenses = (await db.select().from(expenses).where(sql`${expenses.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.supplierBills = (await db.select().from(supplierBills).where(sql`${supplierBills.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.supplierBillLines = (await db.select().from(supplierBillLines).where(sql`${supplierBillLines.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.billPayments = (await db.select().from(billPayments).where(sql`${billPayments.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.recurringBills = (await db.select().from(recurringBills).where(sql`${recurringBills.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.cashAdvances = (await db.select().from(cashAdvances).where(sql`${cashAdvances.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.advanceSettlements = (await db.select().from(advanceSettlements).where(sql`${advanceSettlements.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.reimbursements = (await db.select().from(reimbursements).where(sql`${reimbursements.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.pettyCashFunds = (await db.select().from(pettyCashFunds).where(sql`${pettyCashFunds.orgId} = ${NNACT_ORG_ID}`)).length;
  counts.pettyCashTransactions = (await db.select().from(pettyCashTransactions).where(sql`${pettyCashTransactions.orgId} = ${NNACT_ORG_ID}`)).length;
  return counts;
}
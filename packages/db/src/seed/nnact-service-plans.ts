// Idempotent demo seed for the Service Agreements & Preventive Maintenance
// system: categories → checklists → plan templates → agreements (frozen
// snapshot) → covered assets → scheduled visits.
//
// Stable UUIDs so re-running the seed is a no-op upsert. Only touches the
// NNACT demo organization — no passwords or other demo records are altered.
import { sql } from "drizzle-orm";
import {
  customers,
  equipment,
  users,
  serviceCategories,
  serviceChecklists,
  servicePlans,
  serviceAgreements,
  serviceAgreementAssets,
  serviceVisits,
  type AgreementSnapshot,
  type BenefitConfig,
} from "../index.js";
import { NNACT_ORG_ID, NNACT_USER_IDS } from "./ids.js";

// SQL client with the subset of operations the seed uses (insert/select +
// their chains). Consumer code assigns the real client (db or a transaction).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function customerExists(client: DbClient, customerId: string): Promise<boolean> {
  const rows = await client
    .select({ id: customers.id })
    .from(customers)
    .where(sql`${customers.id} = ${customerId}`);
  return rows.length > 0;
}

async function equipmentExists(client: DbClient, equipmentId: string, customerId: string): Promise<boolean> {
  const rows = await client
    .select({ id: equipment.id })
    .from(equipment)
    .where(sql`${equipment.id} = ${equipmentId} and ${equipment.customerId} = ${customerId}`);
  return rows.length > 0;
}

// Only attribute a row to a demo staff member when that user actually exists
// (e.g. in dev/full demo seeds); stay FK-safe on databases with real staff.
async function ifUserExists(client: DbClient, userId: string): Promise<{ createdBy: string } | Record<string, never>> {
  const rows = await client
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.id} = ${userId}`)
    .limit(1);
  return rows.length > 0 ? { createdBy: userId } : {};
}

export function nnactServiceCategoryId(index: number): string {
  return `b0000001-0014-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactServiceChecklistId(index: number): string {
  return `b0000001-0015-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactServicePlanId(index: number): string {
  return `b0000001-0016-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactServiceAgreementId(index: number): string {
  return `b0000001-0017-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactServiceVisitId(index: number): string {
  return `b0000001-0018-4000-8000-${String(index).padStart(12, "0")}`;
}

export function nnactServiceAssetId(agreementIndex: number, slot: number): string {
  return `b0000001-0019-4000-8000-${String(agreementIndex * 10 + slot).padStart(12, "0")}`;
}

function nnactEquipmentId(index: number): string {
  return `b0000001-0006-4000-8000-${String(index).padStart(12, "0")}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function intervalMonths(frequency: string): number {
  switch (frequency) {
    case "monthly":
      return 1;
    case "bi_monthly":
      return 2;
    case "quarterly":
      return 3;
    case "every_4_months":
      return 4;
    case "semi_annual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
}

type PlanDef = {
  id: string;
  name: string;
  code: string;
  description: string;
  categoryId: string;
  coverageCategories: string[];
  coverageEquipmentTypes: string[];
  targetCustomerType: string;
  maxCoveredAssets: number | null;
  capacityLimits: { scope: string; label: string; max: number; unit: string }[];
  priceCents: number;
  setupFeeCents: number;
  billingFrequency: string;
  termMonths: number;
  autoRenew: boolean;
  renewalType: string;
  maintenanceFrequency: string;
  visitsPerTerm: number;
  primaryVisitType: string;
  activities: string[];
  checklistId: string | null;
  schedulingPriority: string;
  targetResponseHours: number | null;
  emergencyCalloutAllowance: number;
  emergencyCalloutCoverage: string;
  partsPolicy: string;
  partsDiscountPercent: number;
  partsAllowanceCents: number;
  consumablesPolicy: string;
  transportIncluded: boolean;
  benefits: BenefitConfig[];
};

function snapshotFrom(plan: PlanDef): AgreementSnapshot {
  return {
    planId: plan.id,
    planName: plan.name,
    priceCents: plan.priceCents,
    billingFrequency: plan.billingFrequency,
    setupFeeCents: plan.setupFeeCents,
    termMonths: plan.termMonths,
    autoRenew: plan.autoRenew,
    renewalType: plan.renewalType,
    renewalReminders: [30, 7],
    maintenanceFrequency: plan.maintenanceFrequency,
    visitsPerTerm: plan.visitsPerTerm,
    primaryVisitType: plan.primaryVisitType,
    activities: plan.activities,
    maxCoveredAssets: plan.maxCoveredAssets,
    schedulingPriority: plan.schedulingPriority,
    targetResponseHours: plan.targetResponseHours,
    emergencyCalloutAllowance: plan.emergencyCalloutAllowance,
    emergencyCalloutCoverage: plan.emergencyCalloutCoverage,
    partsPolicy: plan.partsPolicy,
    partsDiscountPercent: plan.partsDiscountPercent,
    partsAllowanceCents: plan.partsAllowanceCents,
    consumablesPolicy: plan.consumablesPolicy,
    transportIncluded: plan.transportIncluded,
    benefits: plan.benefits,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Category definitions
// ────────────────────────────────────────────────────────────────────────────

const SERVICE_CATEGORIES = [
  { id: nnactServiceCategoryId(1), name: "HVAC & Cooling", code: "HVAC", description: "Air conditioning, ventilation and evaporative cooling systems" },
  { id: nnactServiceCategoryId(2), name: "Refrigeration & Cold Storage", code: "REFR", description: "Cold rooms, reach-in coolers, freezers and display refrigeration" },
  { id: nnactServiceCategoryId(3), name: "Generators & Power", code: "GEN", description: "Diesel generators, transfer switches and standby power systems" },
  { id: nnactServiceCategoryId(4), name: "Home Appliances", code: "APL", description: "Washing machines, refrigerators, freezers and kitchen appliances" },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Checklist definitions
// ────────────────────────────────────────────────────────────────────────────

type ChecklistDef = {
  id: string;
  name: string;
  categoryId: string;
  items: { id: string; label: string; required?: boolean }[];
};

const SERVICE_CHECKLISTS: ChecklistDef[] = [
  {
    id: nnactServiceChecklistId(1),
    name: "HVAC Preventive Maintenance",
    categoryId: nnactServiceCategoryId(1),
    items: [
      { id: "filters", label: "Clean or replace air filters" },
      { id: "coils", label: "Inspect and clean evaporator & condenser coils" },
      { id: "drain", label: "Clear condensate drain line", required: true },
      { id: "refrigerant", label: "Check and record refrigerant pressures", required: true },
      { id: "electrical", label: "Tighten terminations, check capacitors and contactors" },
      { id: "fan", label: "Lubricate fan motors, check bearings" },
      { id: "controls", label: "Verify thermostat and control settings" },
      { id: "performance", label: "Test cooling performance and log readings", required: true },
    ],
  },
  {
    id: nnactServiceChecklistId(2),
    name: "Generator PM & Load Test",
    categoryId: nnactServiceCategoryId(3),
    items: [
      { id: "oil", label: "Engine oil and filter change", required: true },
      { id: "coolant", label: "Check coolant level and condition" },
      { id: "battery", label: "Load-test battery and clean terminals", required: true },
      { id: "fuel", label: "Inspect fuel system and water separator" },
      { id: "loadtest", label: "Run load bank test and record readings", required: true },
      { id: "ats", label: "Verify auto-transfer switch operation" },
    ],
  },
  {
    id: nnactServiceChecklistId(3),
    name: "Cold Room / Refrigeration PM",
    categoryId: nnactServiceCategoryId(2),
    items: [
      { id: "temp", label: "Download and review temperature logs", required: true },
      { id: "seals", label: "Inspect door seals and hinges", required: true },
      { id: "evap", label: "Clean evaporator coils and defrost drain" },
      { id: "comp", label: "Check compressor health and run current", required: true },
      { id: "refrigerant", label: "Check refrigerant charge and sight glass" },
      { id: "alarms", label: "Verify high-temp alarms call out correctly" },
    ],
  },
  {
    id: nnactServiceChecklistId(4),
    name: "Home Appliance Care",
    categoryId: nnactServiceCategoryId(4),
    items: [
      { id: "clean", label: "Deep-clean exterior and accessible internals" },
      { id: "seals", label: "Check door seals and gaskets" },
      { id: "drain", label: "Inspect drain and filters" },
      { id: "level", label: "Verify appliance is level and stable" },
      { id: "safety", label: "Electrical safety inspection", required: true },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Plan templates
// ────────────────────────────────────────────────────────────────────────────

const SERVICE_PLANS: PlanDef[] = [
  {
    id: nnactServicePlanId(1),
    name: "Residential AC Care",
    code: "NN-RES-AC",
    description: "Quarterly preventive maintenance for residential split, cassette and window AC units in Buea.",
    categoryId: nnactServiceCategoryId(1),
    coverageCategories: ["HVAC & Cooling"],
    coverageEquipmentTypes: ["Split AC", "Cassette AC", "Window AC"],
    targetCustomerType: "residential",
    maxCoveredAssets: 3,
    capacityLimits: [{ scope: "ac_capacity", label: "Per-unit cooling capacity", max: 24, unit: "kBTU/hr" }],
    priceCents: 60000,
    setupFeeCents: 5000,
    billingFrequency: "annual",
    termMonths: 12,
    autoRenew: true,
    renewalType: "automatic",
    maintenanceFrequency: "quarterly",
    visitsPerTerm: 4,
    primaryVisitType: "preventive",
    activities: [
      "Filter cleaning or replacement",
      "Condenser & evaporator coil cleaning",
      "Condensate drain clearing",
      "Refrigerant pressure check",
      "Capacitor and contactor inspection",
      "Cooling performance test and log",
    ],
    checklistId: nnactServiceChecklistId(1),
    schedulingPriority: "standard",
    targetResponseHours: 48,
    emergencyCalloutAllowance: 0,
    emergencyCalloutCoverage: "priority_diagnosis_only",
    partsPolicy: "customer_pays",
    partsDiscountPercent: 0,
    partsAllowanceCents: 0,
    consumablesPolicy: "not_included",
    transportIncluded: true,
    benefits: [
      { key: "filter_cleaning", label: "Filter cleaning or replacement" },
      { key: "coil_cleaning", label: "Evaporator & condenser coil cleaning" },
      { key: "performance_log", label: "Annual cooling performance log" },
      { key: "priority_scheduling", label: "Priority scheduling for repairs" },
    ],
  },
  {
    id: nnactServicePlanId(2),
    name: "Commercial AC Care",
    code: "NN-COM-AC",
    description: "Guaranteed-response preventive maintenance for office and hospitality AC fleets, with an included emergency callout.",
    categoryId: nnactServiceCategoryId(1),
    coverageCategories: ["HVAC & Cooling"],
    coverageEquipmentTypes: ["Split AC", "Cassette AC", "VRF System", "Packaged Unit"],
    targetCustomerType: "commercial",
    maxCoveredAssets: null,
    capacityLimits: [],
    priceCents: 250000,
    setupFeeCents: 15000,
    billingFrequency: "annual",
    termMonths: 12,
    autoRenew: true,
    renewalType: "automatic",
    maintenanceFrequency: "quarterly",
    visitsPerTerm: 4,
    primaryVisitType: "preventive",
    activities: [
      "Filter cleaning or replacement",
      "Condenser & evaporator coil cleaning",
      "Condensate drain clearing",
      "Refrigerant pressure and superheat check",
      "Electrical panel and contactor inspection",
      "Cooling performance test and log",
    ],
    checklistId: nnactServiceChecklistId(1),
    schedulingPriority: "priority",
    targetResponseHours: 24,
    emergencyCalloutAllowance: 1,
    emergencyCalloutCoverage: "labour_included",
    partsPolicy: "discounted_parts",
    partsDiscountPercent: 10,
    partsAllowanceCents: 0,
    consumablesPolicy: "included",
    transportIncluded: true,
    benefits: [
      { key: "filter_cleaning", label: "Filter cleaning or replacement" },
      { key: "coil_cleaning", label: "Coil cleaning each visit" },
      { key: "emergency_callout", label: "1 included emergency callout / yr", details: "Labour included; parts billed at 10% discount." },
      { key: "parts_discount", label: "10% parts discount" },
      { key: "priority_response", label: "24-hour priority response" },
    ],
  },
  {
    id: nnactServicePlanId(3),
    name: "Cold Room Maintenance",
    code: "NN-COLD",
    description: "Full-service protection for walk-in coolers, freezers and stand-alone cold rooms, including temperature-log review and alarm checks.",
    categoryId: nnactServiceCategoryId(2),
    coverageCategories: ["Refrigeration & Cold Storage"],
    coverageEquipmentTypes: ["Cold Room", "Walk-in Freezer", "Reach-In Cooler"],
    targetCustomerType: "commercial",
    maxCoveredAssets: 2,
    capacityLimits: [{ scope: "cold_room_size", label: "Volume per room", max: 120, unit: "m³" }],
    priceCents: 190000,
    setupFeeCents: 10000,
    billingFrequency: "annual",
    termMonths: 12,
    autoRenew: true,
    renewalType: "automatic",
    maintenanceFrequency: "quarterly",
    visitsPerTerm: 4,
    primaryVisitType: "full_service",
    activities: [
      "Temperature log download and review",
      "Evaporator coil and defrost drain cleaning",
      "Door seal and hinge inspection",
      "Compressor health and refrigerant charge check",
      "High-temperature alarm verification",
    ],
    checklistId: nnactServiceChecklistId(3),
    schedulingPriority: "priority",
    targetResponseHours: 24,
    emergencyCalloutAllowance: 1,
    emergencyCalloutCoverage: "labour_included",
    partsPolicy: "discounted_parts",
    partsDiscountPercent: 10,
    partsAllowanceCents: 0,
    consumablesPolicy: "limited",
    transportIncluded: true,
    benefits: [
      { key: "temp_log", label: "Temperature log review each visit" },
      { key: "alarm_check", label: "High-temp alarm verification" },
      { key: "emergency_callout", label: "1 included emergency callout / yr" },
      { key: "parts_discount", label: "10% parts discount" },
    ],
  },
  {
    id: nnactServicePlanId(4),
    name: "Generator Care & Load Testing",
    code: "NN-GEN",
    description: "Twice-yearly generator service with oil/filter changes, battery load testing and documented load-bank testing.",
    categoryId: nnactServiceCategoryId(3),
    coverageCategories: ["Generators & Power"],
    coverageEquipmentTypes: ["Diesel Generator", "Standby Generator", "Inverter Generator"],
    targetCustomerType: "small_business",
    maxCoveredAssets: 2,
    capacityLimits: [{ scope: "generator_capacity", label: "Rated output", max: 120, unit: "kVA" }],
    priceCents: 120000,
    setupFeeCents: 0,
    billingFrequency: "annual",
    termMonths: 12,
    autoRenew: true,
    renewalType: "automatic",
    maintenanceFrequency: "semi_annual",
    visitsPerTerm: 2,
    primaryVisitType: "performance_testing",
    activities: [
      "Engine oil and filter change",
      "Coolant, fuel and water separator check",
      "Battery load test and terminal cleaning",
      "Load bank test with readings",
      "Auto-transfer switch verification",
    ],
    checklistId: nnactServiceChecklistId(2),
    schedulingPriority: "standard",
    targetResponseHours: 48,
    emergencyCalloutAllowance: 0,
    emergencyCalloutCoverage: "priority_diagnosis_only",
    partsPolicy: "labour_only",
    partsDiscountPercent: 0,
    partsAllowanceCents: 0,
    consumablesPolicy: "not_included",
    transportIncluded: false,
    benefits: [
      { key: "oil_service", label: "2 oil & filter changes / yr" },
      { key: "load_test", label: "Documented load-bank test each visit" },
      { key: "battery", label: "Battery load testing" },
      { key: "ats_check", label: "Auto-transfer switch verification" },
    ],
  },
  {
    id: nnactServicePlanId(5),
    name: "Full Home Appliance Care",
    code: "NN-APL",
    description: "Seasonal care and safety checks for refrigerators, freezers and washing machines across the home.",
    categoryId: nnactServiceCategoryId(4),
    coverageCategories: ["Home Appliances"],
    coverageEquipmentTypes: ["Refrigerator", "Freezer", "Washing Machine"],
    targetCustomerType: "residential",
    maxCoveredAssets: 4,
    capacityLimits: [],
    priceCents: 45000,
    setupFeeCents: 0,
    billingFrequency: "annual",
    termMonths: 12,
    autoRenew: false,
    renewalType: "manual",
    maintenanceFrequency: "quarterly",
    visitsPerTerm: 4,
    primaryVisitType: "cleaning",
    activities: [
      "Deep-clean accessible internals",
      "Door seal and gasket check",
      "Drain and filter inspection",
      "Leveling and stability check",
      "Electrical safety inspection",
    ],
    checklistId: nnactServiceChecklistId(4),
    schedulingPriority: "standard",
    targetResponseHours: null,
    emergencyCalloutAllowance: 0,
    emergencyCalloutCoverage: "priority_diagnosis_only",
    partsPolicy: "customer_pays",
    partsDiscountPercent: 0,
    partsAllowanceCents: 0,
    consumablesPolicy: "included",
    transportIncluded: true,
    benefits: [
      { key: "deep_clean", label: "Appliance deep-cleaning each visit" },
      { key: "safety", label: "Electrical safety inspection" },
      { key: "seals", label: "Door seal and gasket checks" },
    ],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Demo agreements (instances against seeded customers/equipment)
// ────────────────────────────────────────────────────────────────────────────

type AgreementDef = {
  id: string;
  customerIndex: number;
  planId: string;
  status: string;
  paymentStatus: string;
  startsDaysAgo: number;
  assetEquipmentIndexes: number[];
  completedVisits: number;
  visitsIncluded: number;
  notes?: string;
};

const SERVICE_AGREEMENTS: AgreementDef[] = [
  {
    id: nnactServiceAgreementId(1),
    customerIndex: 1,
    planId: nnactServicePlanId(1),
    status: "active",
    paymentStatus: "paid",
    startsDaysAgo: 120,
    assetEquipmentIndexes: [1],
    completedVisits: 1,
    visitsIncluded: 4,
    notes: "Home cooling check twice per year; customer prefers morning visits.",
  },
  {
    id: nnactServiceAgreementId(2),
    customerIndex: 13,
    planId: nnactServicePlanId(2),
    status: "active",
    paymentStatus: "unpaid",
    startsDaysAgo: 95,
    assetEquipmentIndexes: [13, 14],
    completedVisits: 1,
    visitsIncluded: 4,
    notes: "Covers guest rooms and kitchen refrigeration at Summit View.",
  },
  {
    id: nnactServiceAgreementId(3),
    customerIndex: 18,
    planId: nnactServicePlanId(3),
    status: "active",
    paymentStatus: "partial",
    startsDaysAgo: 60,
    assetEquipmentIndexes: [21],
    completedVisits: 0,
    visitsIncluded: 4,
    notes: "Processing-line cold rooms — temperature alarms must call out.",
  },
  {
    id: nnactServiceAgreementId(4),
    customerIndex: 19,
    planId: nnactServicePlanId(4),
    status: "active",
    paymentStatus: "unpaid",
    startsDaysAgo: 40,
    assetEquipmentIndexes: [24],
    completedVisits: 0,
    visitsIncluded: 2,
    notes: "Standby generator at Hilltop Hotel critical during outages.",
  },
  {
    id: nnactServiceAgreementId(5),
    customerIndex: 14,
    planId: nnactServicePlanId(2),
    status: "pending_approval",
    paymentStatus: "unpaid",
    startsDaysAgo: 8,
    assetEquipmentIndexes: [15],
    completedVisits: 0,
    visitsIncluded: 4,
  },
];

// ────────────────────────────────────────────────────────────────────────────

export async function seedNnactServicePlans(client: { insert: (table: unknown) => unknown }): Promise<void> {
  // Categories
  for (const category of SERVICE_CATEGORIES) {
    await (client.insert(serviceCategories) as any)
      .values({
        id: category.id,
        orgId: NNACT_ORG_ID,
        name: category.name,
        code: category.code,
        description: category.description,
        sortOrder: 0,
        active: true,
      })
      .onConflictDoUpdate({
        target: serviceCategories.id,
        set: {
          name: category.name,
          code: category.code,
          description: category.description,
          updatedAt: new Date(),
        },
      });
  }

  // Checklists
  for (const checklist of SERVICE_CHECKLISTS) {
    await (client.insert(serviceChecklists) as any)
      .values({
        id: checklist.id,
        orgId: NNACT_ORG_ID,
        name: checklist.name,
        categoryId: checklist.categoryId,
        items: checklist.items,
        active: true,
      })
      .onConflictDoUpdate({
        target: serviceChecklists.id,
        set: {
          name: checklist.name,
          categoryId: checklist.categoryId,
          items: checklist.items,
          updatedAt: new Date(),
        },
      });
  }

  // Plans
  for (const plan of SERVICE_PLANS) {
    await (client.insert(servicePlans) as any)
      .values({
        id: plan.id,
        orgId: NNACT_ORG_ID,
        status: "active",
        planType: "standard" as const,
        name: plan.name,
        code: plan.code,
        description: plan.description,
        categoryId: plan.categoryId,
        coverageCategories: plan.coverageCategories,
        coverageEquipmentTypes: plan.coverageEquipmentTypes,
        targetCustomerType: plan.targetCustomerType,
        maxCoveredAssets: plan.maxCoveredAssets,
        capacityLimits: plan.capacityLimits,
        pricingModel: "fixed" as const,
        priceCents: plan.priceCents,
        billingFrequency: plan.billingFrequency,
        setupFeeCents: plan.setupFeeCents,
        termMonths: plan.termMonths,
        autoRenew: plan.autoRenew,
        renewalType: plan.renewalType,
        renewalReminders: [30, 7],
        maintenanceFrequency: plan.maintenanceFrequency,
        visitsPerTerm: plan.visitsPerTerm,
        primaryVisitType: plan.primaryVisitType,
        activities: plan.activities,
        checklistId: plan.checklistId,
        schedulingPriority: plan.schedulingPriority,
        targetResponseHours: plan.targetResponseHours,
        emergencyCalloutAllowance: plan.emergencyCalloutAllowance,
        emergencyCalloutCoverage: plan.emergencyCalloutCoverage,
        partsPolicy: plan.partsPolicy,
        partsDiscountPercent: plan.partsDiscountPercent,
        partsAllowanceCents: plan.partsAllowanceCents,
        consumablesPolicy: plan.consumablesPolicy,
        transportIncluded: plan.transportIncluded,
        benefits: plan.benefits,
      })
      .onConflictDoUpdate({
        target: servicePlans.id,
        set: {
          status: "active",
          name: plan.name,
          code: plan.code,
          description: plan.description,
          categoryId: plan.categoryId,
          coverageCategories: plan.coverageCategories,
          coverageEquipmentTypes: plan.coverageEquipmentTypes,
          targetCustomerType: plan.targetCustomerType,
          capacityLimits: plan.capacityLimits,
          priceCents: plan.priceCents,
          billingFrequency: plan.billingFrequency,
          termMonths: plan.termMonths,
          autoRenew: plan.autoRenew,
          renewalType: plan.renewalType,
          maintenanceFrequency: plan.maintenanceFrequency,
          visitsPerTerm: plan.visitsPerTerm,
          primaryVisitType: plan.primaryVisitType,
          activities: plan.activities,
          checklistId: plan.checklistId,
          schedulingPriority: plan.schedulingPriority,
          targetResponseHours: plan.targetResponseHours,
          emergencyCalloutCoverage: plan.emergencyCalloutCoverage,
          partsPolicy: plan.partsPolicy,
          partsDiscountPercent: plan.partsDiscountPercent,
          consumablesPolicy: plan.consumablesPolicy,
          transportIncluded: plan.transportIncluded,
          benefits: plan.benefits,
          updatedAt: new Date(),
        },
      });
  }

  // Agreements (idempotent by stable id) + assets + scheduled visits.
  // Agreements are only created when the referenced customer exists, so the
  // same seed can run on an empty catalog in production (which has real
  // customers, not the demo ones) and still safely fill the plan templates.
  let visitCounter = 0;
  let agreementCounter = 0;
  for (const agreement of SERVICE_AGREEMENTS) {
    const plan = SERVICE_PLANS.find((p) => p.id === agreement.planId);
    if (!plan) continue;
    const customerId = `b0000001-0003-4000-8000-${String(agreement.customerIndex).padStart(12, "0")}`;
    if (!(await customerExists(client, customerId))) {
      console.log(`seed:nnact-service-plans → skipping agreement for missing customer ${customerId} (${plan.name})`);
      continue;
    }
    const startsAt = new Date(Date.now() - agreement.startsDaysAgo * 86_400_000);
    const snapshot = snapshotFrom(plan);
    const endsAt = addMonths(startsAt, plan.termMonths);

    await (client.insert(serviceAgreements) as any)
      .values({
        id: agreement.id,
        orgId: NNACT_ORG_ID,
        agreementNumber: `NNACT-SVC-2026-${String(SERVICE_AGREEMENTS.indexOf(agreement) + 1).padStart(6, "0")}`,
        customerId,
        planId: plan.id,
        planName: plan.name,
        planSnapshot: snapshot,
        status: agreement.status,
        paymentStatus: agreement.paymentStatus,
        startsAt,
        endsAt,
        autoRenew: snapshot.autoRenew,
        renewalType: snapshot.renewalType,
        visitsIncluded: agreement.visitsIncluded,
        visitsCompleted: agreement.completedVisits,
        priceCents: plan.priceCents,
        billingFrequency: plan.billingFrequency,
        notes: agreement.notes ?? null,
        ...(await ifUserExists(client, NNACT_USER_IDS.dispatchGrace)),
      })
      .onConflictDoUpdate({
        target: serviceAgreements.id,
        set: {
          status: agreement.status,
          paymentStatus: agreement.paymentStatus,
          visitsIncluded: agreement.visitsIncluded,
          visitsCompleted: agreement.completedVisits,
          notes: agreement.notes ?? null,
          updatedAt: new Date(),
        },
      });
    agreementCounter += 1;

    for (let slot = 0; slot < agreement.assetEquipmentIndexes.length; slot += 1) {
      const equipmentIndex = agreement.assetEquipmentIndexes[slot];
      const equipmentId = nnactEquipmentId(equipmentIndex);
      if (!(await equipmentExists(client, equipmentId, customerId))) {
        console.log(`seed:nnact-service-plans → skipping asset ${equipmentId} for agreement ${agreement.id} (not owned by customer)`);
        continue;
      }
      await (client.insert(serviceAgreementAssets) as any)
        .values({
          id: nnactServiceAssetId(SERVICE_AGREEMENTS.indexOf(agreement) + 1, slot),
          orgId: NNACT_ORG_ID,
          agreementId: agreement.id,
          equipmentId,
        })
        .onConflictDoNothing();
    }

    const monthsPerVisit = intervalMonths(plan.maintenanceFrequency);
    const techAttribution = await ifUserExists(client, NNACT_USER_IDS.techFrankline);
    const dispatchAttribution = await ifUserExists(client, NNACT_USER_IDS.dispatchGrace);
    const due = new Date(startsAt);
    for (let i = 1; i <= agreement.visitsIncluded; i += 1) {
      visitCounter += 1;
      const isCompleted = i <= agreement.completedVisits;
      const completedAt = new Date(due.getTime() - 2 * 86_400_000);
      await (client.insert(serviceVisits) as any)
        .values({
          id: nnactServiceVisitId(visitCounter),
          orgId: NNACT_ORG_ID,
          visitNumber: `VISIT-2026-${String(visitCounter).padStart(6, "0")}`,
          agreementId: agreement.id,
          equipmentId: null,
          title: `${plan.name} — Service ${i}/${agreement.visitsIncluded}`,
          visitType: plan.primaryVisitType,
          status: isCompleted ? "completed" : "scheduled",
          scheduledAt: new Date(due),
          dueAt: new Date(due),
          arrivedAt: isCompleted ? completedAt : null,
          completedAt: isCompleted ? completedAt : null,
          technicianId: isCompleted ? (techAttribution.createdBy ?? null) : null,
          activities: plan.activities,
          problemsFound: isCompleted ? ["Coil fins bent in two places", "Dirty filters"] : [],
          workPerformed: isCompleted ? "Cleaned evaporator and condenser coils, straightened fins, replaced filters, refrigerant pressures within spec." : null,
          partsUsed: [],
          recommendations: isCompleted ? "Monitor compressor run current; review at next visit." : null,
          createdBy: isCompleted ? (techAttribution.createdBy ?? null) : (dispatchAttribution.createdBy ?? null),
        })
        .onConflictDoNothing();
      due.setUTCMonth(due.getUTCMonth() + monthsPerVisit);
    }
  }

  console.log(
    `seed:nnact-service-plans → ${SERVICE_CATEGORIES.length} categories, ${SERVICE_CHECKLISTS.length} checklists, ${SERVICE_PLANS.length} plan templates, ${agreementCounter} agreements, ${visitCounter} visits`,
  );
}
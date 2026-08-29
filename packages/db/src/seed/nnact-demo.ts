import { eq, sql } from "drizzle-orm";
import {
  appointments,
  customerAccountLinks,
  customerAccounts,
  customers,
  db,
  equipment,
  equipmentModels,
  estimateOptions,
  estimates,
  faultSymptoms,
  invoices,
  invoiceLineItems,
  jobEquipmentLinks,
  jobs,
  knownFaults,
  modelParts,
  orgs,
  payments,
  properties,
  repairOutcomes,
  repairProcedures,
  symptoms,
  testPoints,
  users,
} from "../index.js";
import { DEFAULT_BUSINESS_SETTINGS } from "@nnact/shared";
import { NNACT_ORG_ID } from "./ids.js";
import { demoPasswordHash, NNACT_DEMO_PASSWORD } from "./password.js";
import {
  COMMERCIAL_CUSTOMERS,
  EQUIPMENT_INSTANCES,
  EQUIPMENT_MODELS,
  JOB_SPECS,
  NNACT_ORG,
  NNACT_STAFF,
  NNACT_PROPERTIES,
  PORTAL_DEMO_CUSTOMER,
  RESIDENTIAL_CUSTOMERS,
  xaf,
} from "./nnact-data.js";
import { seedNnactCatalog } from "./nnact-catalog.js";
import {
  NNACT_USER_IDS,
  nnactAppointmentId,
  nnactCustomerId,
  nnactEstimateId,
  nnactFaultId,
  nnactInvoiceId,
  nnactJobId,
  nnactPaymentId,
  nnactPropertyId,
  nnactRepairOutcomeId,
  nnactSymptomId,
} from "./ids.js";

function assertDevelopmentSeedAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_NNACT_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing NNACT demo seed in production. Set ALLOW_NNACT_DEMO_SEED=true only for controlled demo deployments.",
    );
  }
}

function scheduleDate(dayOffset: number, hour = 9): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date;
}

function nnactBusinessSettings() {
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    currency: "XAF" as const,
    businessHours: {
      timezone: "Africa/Douala",
      workDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
      startTime: "07:30",
      endTime: "18:00",
    },
    serviceAreas: ["Buea", "Molyko", "Bonduma", "Great Soppo", "Small Soppo", "Mile 16", "Bokwango", "Bomaka", "South-West Cameroon"],
    invoice: {
      ...DEFAULT_BUSINESS_SETTINGS.invoice,
      paymentInstructions: "Pay via MTN MoMo, Orange Money, bank transfer, or cash at our Buea office.",
      defaultMessage: "Thank you for choosing NNACT. Please settle the balance by the due date.",
    },
    estimate: {
      ...DEFAULT_BUSINESS_SETTINGS.estimate,
      defaultMessage: "This estimate covers diagnosis and repair under normal access conditions in Buea.",
    },
    numbering: {
      invoicePrefix: "NNINV",
      invoiceNextNumber: 2000,
      estimatePrefix: "NNEST",
      estimateNextNumber: 2000,
    },
    portal: {
      ...DEFAULT_BUSINESS_SETTINGS.portal,
      enabled: true,
      allowEstimateApproval: true,
      allowInvoicePayment: false,
      allowServiceHistory: true,
    },
  };
}

export async function seedNnactDemo(): Promise<void> {
  assertDevelopmentSeedAllowed();

  await db.transaction(async (tx) => {
    await tx
      .insert(orgs)
      .values({
        id: NNACT_ORG_ID,
        name: NNACT_ORG.name,
        timezone: NNACT_ORG.timezone,
        publicEmail: NNACT_ORG.publicEmail,
        publicPhone: NNACT_ORG.publicPhone,
        publicAddress: NNACT_ORG.publicAddress,
        brandColor: NNACT_ORG.brandColor,
        documentFooter: NNACT_ORG.documentFooter,
        businessSettings: nnactBusinessSettings(),
      })
      .onConflictDoUpdate({
        target: orgs.id,
        set: {
          name: NNACT_ORG.name,
          timezone: NNACT_ORG.timezone,
          publicEmail: NNACT_ORG.publicEmail,
          publicPhone: NNACT_ORG.publicPhone,
          publicAddress: NNACT_ORG.publicAddress,
          brandColor: NNACT_ORG.brandColor,
          documentFooter: NNACT_ORG.documentFooter,
          businessSettings: nnactBusinessSettings(),
          updatedAt: new Date(),
        },
      });

    for (const staff of NNACT_STAFF) {
      await tx
        .insert(users)
        .values({
          id: staff.id,
          orgId: NNACT_ORG_ID,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          active: true,
          passwordHash: demoPasswordHash(NNACT_DEMO_PASSWORD, staff.email),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            orgId: NNACT_ORG_ID,
            email: staff.email,
            name: staff.name,
            role: staff.role,
            active: true,
            passwordHash: demoPasswordHash(NNACT_DEMO_PASSWORD, staff.email),
          },
        });
    }

    for (const [index, row] of RESIDENTIAL_CUSTOMERS.entries()) {
      await tx
        .insert(customers)
        .values({
          id: row.id,
          orgId: NNACT_ORG_ID,
          name: row.name,
          email: row.email ?? null,
          phone: row.phone,
          notes: `[DEMO] Residential · ${row.area} · Preferred contact: phone · Buea, South-West, Cameroon`,
        })
        .onConflictDoUpdate({
          target: customers.id,
          set: {
            name: row.name,
            email: row.email ?? null,
            phone: row.phone,
            notes: `[DEMO] Residential · ${row.area} · Preferred contact: phone · Buea, South-West, Cameroon`,
            updatedAt: new Date(),
          },
        });
    }

    for (const row of COMMERCIAL_CUSTOMERS) {
      await tx
        .insert(customers)
        .values({
          id: row.id,
          orgId: NNACT_ORG_ID,
          name: row.name,
          email: row.email ?? null,
          phone: row.phone,
          notes: `[DEMO] Commercial · ${row.type} · Contact: ${row.contact} · ${row.area}, Buea`,
        })
        .onConflictDoUpdate({
          target: customers.id,
          set: {
            name: row.name,
            email: row.email ?? null,
            phone: row.phone,
            notes: `[DEMO] Commercial · ${row.type} · Contact: ${row.contact} · ${row.area}, Buea`,
            updatedAt: new Date(),
          },
        });
    }

    for (const property of NNACT_PROPERTIES) {
      await tx
        .insert(properties)
        .values({
          id: property.id,
          orgId: NNACT_ORG_ID,
          customerId: property.customerId,
          address: property.address,
        })
        .onConflictDoUpdate({
          target: properties.id,
          set: { address: property.address, customerId: property.customerId },
        });
    }

    for (const model of EQUIPMENT_MODELS) {
      await tx
        .insert(equipmentModels)
        .values({
          id: model.id,
          orgId: NNACT_ORG_ID,
          manufacturer: model.manufacturer,
          modelNumber: model.modelNumber,
          modelName: model.modelName,
          category: model.category,
          normalizedIdentifier: model.normalizedIdentifier,
          createdBy: NNACT_USER_IDS.owner,
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

    for (const item of EQUIPMENT_INSTANCES) {
      const model = EQUIPMENT_MODELS[item.modelIndex - 1];
      await tx
        .insert(equipment)
        .values({
          id: item.id,
          orgId: NNACT_ORG_ID,
          customerId: nnactCustomerId(item.customerIndex),
          propertyId: nnactPropertyId(item.propertyIndex),
          equipmentModelId: model.id,
          type: item.type,
          make: item.make,
          model: item.model,
          serialNumber: item.serial,
          assetTag: item.assetTag ?? null,
          condition: item.condition,
          installDate: new Date("2022-06-01"),
          lastMaintenance: item.condition === "NEEDS_SERVICE" ? new Date(Date.now() - 120 * 86_400_000) : new Date(Date.now() - 30 * 86_400_000),
          nextMaintenance: item.condition === "NEEDS_SERVICE" ? new Date(Date.now() - 7 * 86_400_000) : new Date(Date.now() + 60 * 86_400_000),
          notes: `[DEMO] Synthetic serial for NNACT development seed`,
        })
        .onConflictDoUpdate({
          target: equipment.id,
          set: {
            customerId: nnactCustomerId(item.customerIndex),
            propertyId: nnactPropertyId(item.propertyIndex),
            equipmentModelId: model.id,
            condition: item.condition,
            serialNumber: item.serial,
            assetTag: item.assetTag ?? null,
            updatedAt: new Date(),
          },
        });
    }

    let appointmentCounter = 1;
    for (const spec of JOB_SPECS) {
      const assigneeId = NNACT_USER_IDS[spec.assignee];
      const scheduledAt = scheduleDate(spec.dayOffset, spec.hour ?? 9);
      await tx
        .insert(jobs)
        .values({
          id: spec.id,
          orgId: NNACT_ORG_ID,
          customerId: nnactCustomerId(spec.customerIndex),
          propertyId: nnactPropertyId(spec.propertyIndex),
          assignedTo: assigneeId,
          title: spec.title,
          description: spec.description,
          status: spec.status,
          scheduledAt,
          total: xaf(spec.totalXaf),
        })
        .onConflictDoUpdate({
          target: jobs.id,
          set: {
            assignedTo: assigneeId,
            title: spec.title,
            description: spec.description,
            status: spec.status,
            scheduledAt,
            total: xaf(spec.totalXaf),
            updatedAt: new Date(),
          },
        });

      if (spec.equipmentIndex) {
        await tx
          .insert(jobEquipmentLinks)
          .values({
            orgId: NNACT_ORG_ID,
            jobId: spec.id,
            equipmentId: `b0000001-0006-4000-8000-${String(spec.equipmentIndex).padStart(12, "0")}`,
            linkedBy: NNACT_USER_IDS.dispatchGrace,
          })
          .onConflictDoNothing({ target: jobEquipmentLinks.jobId });
      }

      if (spec.kind === "today" || (spec.status === "scheduled" && spec.dayOffset >= 0 && spec.dayOffset <= 1)) {
        const startsAt = scheduleDate(spec.dayOffset, spec.hour ?? 9);
        const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
        await tx
          .insert(appointments)
          .values({
            id: nnactAppointmentId(appointmentCounter),
            orgId: NNACT_ORG_ID,
            jobId: spec.id,
            technicianId: assigneeId,
            startsAt,
            endsAt,
          })
          .onConflictDoUpdate({
            target: appointments.id,
            set: { technicianId: assigneeId, startsAt, endsAt, updatedAt: new Date() },
          });
        appointmentCounter += 1;
      }
    }

    await tx
      .insert(symptoms)
      .values({
        id: nnactSymptomId(1),
        orgId: NNACT_ORG_ID,
        label: "Machine does not drain",
        normalizedLabel: "machine does not drain",
        category: "drainage",
      })
      .onConflictDoUpdate({
        target: symptoms.id,
        set: { label: "Machine does not drain", normalizedLabel: "machine does not drain" },
      });

    await tx
      .insert(symptoms)
      .values({
        id: nnactSymptomId(2),
        orgId: NNACT_ORG_ID,
        label: "Water remains in drum",
        normalizedLabel: "water remains in drum",
        category: "drainage",
      })
      .onConflictDoUpdate({
        target: symptoms.id,
        set: { label: "Water remains in drum", normalizedLabel: "water remains in drum" },
      });

    const [drainSymptom] = await tx.select().from(symptoms).where(eq(symptoms.id, nnactSymptomId(1))).limit(1);
    if (!drainSymptom) throw new Error("seed: drain symptom missing after upsert");

    const samsungModelId = EQUIPMENT_MODELS[0].id;
    const [drainFault] = await tx
      .insert(knownFaults)
      .values({
        id: nnactFaultId(1),
        orgId: NNACT_ORG_ID,
        equipmentModelId: samsungModelId,
        faultCode: "5C",
        normalizedFaultCode: "5c",
        title: "Does not drain",
        description: "Water remains in drum after cycle. Drain pump may be blocked or failed.",
        severity: "medium",
        frequency: "common",
        probableCauses: ["blocked filter", "blocked hose", "failed drain pump", "wiring fault"],
        safetyWarnings: ["electrical_hazard"],
        confidenceStatus: "repeated_success",
        verificationStatus: "verified",
        sourceType: "field_job",
        createdBy: NNACT_USER_IDS.seniorEmmanuel,
        verifiedBy: NNACT_USER_IDS.seniorEmmanuel,
        verifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: knownFaults.id,
        set: {
          title: "Does not drain",
          verificationStatus: "verified",
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.insert(faultSymptoms).values([
      { orgId: NNACT_ORG_ID, faultId: drainFault.id, symptomId: drainSymptom.id },
      { orgId: NNACT_ORG_ID, faultId: drainFault.id, symptomId: nnactSymptomId(2) },
    ]).onConflictDoNothing();

    await tx.insert(repairProcedures).values({
      orgId: NNACT_ORG_ID,
      equipmentModelId: samsungModelId,
      knownFaultId: drainFault.id,
      title: "Replace drain pump",
      description: "Replace failed drain pump after confirming open circuit on winding.",
      safetyWarnings: ["electrical_hazard"],
      requiredTools: ["multimeter", "Torx T20", "pliers"],
      requiredParts: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A" }],
      steps: [
        { sequence: 1, instruction: "Unplug machine and isolate water supply.", warning: "electrical_hazard" },
        { sequence: 2, instruction: "Remove bottom access panel and drain filter." },
        { sequence: 3, instruction: "Measure pump winding at CN3 — expect 150–220 Ω." },
        { sequence: 4, instruction: "Install replacement pump DC31-00181A." },
        { sequence: 5, instruction: "Run drain/spin test cycle.", verification: "No 5C error; drum drains completely." },
      ],
      expectedDurationMinutes: 45,
      skillLevel: "intermediate",
      verificationSteps: ["Run full drain cycle", "Confirm no error code"],
      confidenceStatus: "repeated_success",
      verificationStatus: "verified",
      createdBy: NNACT_USER_IDS.seniorEmmanuel,
      verifiedBy: NNACT_USER_IDS.seniorEmmanuel,
      verifiedAt: new Date(),
    }).onConflictDoNothing();

    await tx.insert(testPoints).values({
      orgId: NNACT_ORG_ID,
      equipmentModelId: samsungModelId,
      component: "Drain pump",
      description: "Pump winding resistance at connector CN3",
      connector: "CN3",
      pin: "1-2",
      expectedMin: "150",
      expectedMax: "220",
      unit: "Ω",
      confidenceStatus: "technician_verified",
      verificationStatus: "verified",
      createdBy: NNACT_USER_IDS.seniorEmmanuel,
    }).onConflictDoNothing();

    await tx.insert(modelParts).values({
      orgId: NNACT_ORG_ID,
      equipmentModelId: samsungModelId,
      partName: "Drain pump assembly",
      oemPartNumber: "DC31-00181A",
      manufacturer: "Samsung",
      alternativePartNumber: "Askoll M231 XP",
      lastKnownPriceCents: xaf(8500),
      reliabilityNotes: "OEM preferred for NNACT demo records.",
      confidenceStatus: "repeated_success",
      verificationStatus: "verified",
      createdBy: NNACT_USER_IDS.seniorEmmanuel,
      verifiedBy: NNACT_USER_IDS.seniorEmmanuel,
      verifiedAt: new Date(),
    }).onConflictDoNothing();

    await tx.insert(repairOutcomes).values([
      {
        id: nnactRepairOutcomeId(1),
        orgId: NNACT_ORG_ID,
        jobId: nnactJobId(1),
        equipmentId: nnactEquipmentId(3),
        equipmentModelId: samsungModelId,
        knownFaultId: drainFault.id,
        outcome: "failed",
        whatWasDone: "Cleared drain filter and hose — fault persisted.",
        partsUsed: [],
        laborMinutes: 35,
        technicianId: NNACT_USER_IDS.techDelphine,
        machineStatus: "non_operational",
        technicianConfidence: 3,
        customerOutcome: "Issue unresolved — follow-up scheduled",
        conclusion: "Filter clear did not restore drain function.",
        isFailedAttempt: true,
      },
      {
        id: nnactRepairOutcomeId(2),
        orgId: NNACT_ORG_ID,
        jobId: nnactJobId(1),
        equipmentId: nnactEquipmentId(3),
        equipmentModelId: samsungModelId,
        knownFaultId: drainFault.id,
        outcome: "successful",
        whatWasDone: "Measured open circuit on drain pump winding; replaced pump DC31-00181A.",
        partsUsed: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A", quantity: 1 }],
        laborMinutes: 50,
        technicianId: NNACT_USER_IDS.seniorEmmanuel,
        machineStatus: "operational",
        technicianConfidence: 5,
        customerOutcome: "Machine drains normally",
        conclusion: "Drain pump failed — open circuit confirmed.",
        isFailedAttempt: false,
      },
    ]).onConflictDoUpdate({
      target: repairOutcomes.id,
      set: {
        outcome: sql`excluded.outcome`,
        whatWasDone: sql`excluded.what_was_done`,
        isFailedAttempt: sql`excluded.is_failed_attempt`,
      },
    });

    await tx
      .insert(invoices)
      .values([
        { id: nnactInvoiceId(1), orgId: NNACT_ORG_ID, jobId: nnactJobId(1), number: "NNINV-2001", status: "paid", total: xaf(35000) },
        { id: nnactInvoiceId(2), orgId: NNACT_ORG_ID, jobId: nnactJobId(2), number: "NNINV-2002", status: "paid", total: xaf(15000) },
        { id: nnactInvoiceId(3), orgId: NNACT_ORG_ID, jobId: nnactJobId(6), number: "NNINV-2003", status: "sent", total: xaf(60000) },
        { id: nnactInvoiceId(4), orgId: NNACT_ORG_ID, jobId: nnactJobId(7), number: "NNINV-2004", status: "sent", total: xaf(85000) },
        { id: nnactInvoiceId(5), orgId: NNACT_ORG_ID, jobId: nnactJobId(11), number: "NNINV-2005", status: "draft", total: xaf(120000) },
      ])
      .onConflictDoUpdate({
        target: invoices.id,
        set: { status: sql`excluded.status`, total: sql`excluded.total`, updatedAt: new Date() },
      });

    await tx.insert(invoiceLineItems).values([
      { orgId: NNACT_ORG_ID, invoiceId: nnactInvoiceId(1), description: "Drain pump replacement labour", quantity: 1, unitPrice: xaf(20000), unitCost: xaf(8000), position: 0 },
      { orgId: NNACT_ORG_ID, invoiceId: nnactInvoiceId(1), description: "Samsung drain pump DC31-00181A", quantity: 1, unitPrice: xaf(15000), unitCost: xaf(8500), position: 1 },
    ]).onConflictDoNothing();

    await tx.insert(payments).values([
      { id: nnactPaymentId(1), orgId: NNACT_ORG_ID, invoiceId: nnactInvoiceId(1), amount: xaf(35000), method: "manual", reference: "MoMo DEMO-001", paidAt: new Date(Date.now() - 40 * 86_400_000) },
      { id: nnactPaymentId(2), orgId: NNACT_ORG_ID, invoiceId: nnactInvoiceId(2), amount: xaf(15000), method: "manual", reference: "Cash DEMO-002", paidAt: new Date(Date.now() - 28 * 86_400_000) },
      { id: nnactPaymentId(3), orgId: NNACT_ORG_ID, invoiceId: nnactInvoiceId(4), amount: xaf(40000), method: "manual", reference: "Bank DEMO-003", paidAt: new Date(Date.now() - 5 * 86_400_000) },
    ]).onConflictDoUpdate({
      target: payments.id,
      set: { amount: sql`excluded.amount`, reference: sql`excluded.reference` },
    });

    await tx
      .insert(estimates)
      .values({
        id: nnactEstimateId(1),
        orgId: NNACT_ORG_ID,
        jobId: nnactJobId(16),
        number: "NNEST-2001",
        status: "sent",
        total: xaf(75000),
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
      })
      .onConflictDoUpdate({
        target: estimates.id,
        set: { status: "sent", total: xaf(75000), updatedAt: new Date() },
      });

    await tx.insert(estimateOptions).values({
      orgId: NNACT_ORG_ID,
      estimateId: nnactEstimateId(1),
      label: "Inverter board diagnosis and repair",
      position: 0,
      total: xaf(75000),
    }).onConflictDoNothing();

    await tx
      .insert(customerAccounts)
      .values({
        id: PORTAL_DEMO_CUSTOMER.accountId,
        email: PORTAL_DEMO_CUSTOMER.email,
        name: PORTAL_DEMO_CUSTOMER.name,
        passwordHash: demoPasswordHash(NNACT_DEMO_PASSWORD, PORTAL_DEMO_CUSTOMER.email),
        active: true,
        emailVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerAccounts.id,
        set: {
          name: PORTAL_DEMO_CUSTOMER.name,
          passwordHash: demoPasswordHash(NNACT_DEMO_PASSWORD, PORTAL_DEMO_CUSTOMER.email),
          active: true,
        },
      });

    await tx
      .insert(customerAccountLinks)
      .values({
        orgId: NNACT_ORG_ID,
        customerId: PORTAL_DEMO_CUSTOMER.customerId,
        accountId: PORTAL_DEMO_CUSTOMER.accountId,
        linkedVia: "demo_seed",
      })
      .onConflictDoUpdate({
        target: [customerAccountLinks.orgId, customerAccountLinks.customerId],
        set: { linkedVia: "demo_seed" },
      });

    await seedNnactCatalog(tx);
  });

  console.log("seed: NNACT demo organization ensured (idempotent)");
  console.log(`seed: org id ${NNACT_ORG_ID}`);
  console.log("seed: set DEFAULT_ORG_ID / NEXT_PUBLIC_DEFAULT_ORG_ID / EXPO_PUBLIC_DEFAULT_ORG_ID to this UUID");
  console.log(`seed: staff demo password (DEVELOPMENT ONLY): ${NNACT_DEMO_PASSWORD}`);
  console.log("seed: owner login: salathiel.ayuk@nnact.demo");
  console.log("seed: customer portal login: marie.fon.demo@example.test");
}

function nnactEquipmentId(index: number) {
  return `b0000001-0006-4000-8000-${String(index).padStart(12, "0")}`;
}

export async function verifyNnactSeed(): Promise<Record<string, number>> {
  const counts = {
    orgs: 0,
    users: 0,
    customers: 0,
    properties: 0,
    equipment: 0,
    equipmentModels: 0,
    jobs: 0,
    appointments: 0,
    invoices: 0,
    payments: 0,
    repairOutcomes: 0,
  };

  const [org] = await db.select().from(orgs).where(sql`${orgs.id} = ${NNACT_ORG_ID}`);
  if (!org) return counts;
  counts.orgs = 1;

  const userRows = await db.select().from(users).where(sql`${users.orgId} = ${NNACT_ORG_ID}`);
  counts.users = userRows.length;

  const customerRows = await db.select().from(customers).where(sql`${customers.orgId} = ${NNACT_ORG_ID}`);
  counts.customers = customerRows.length;

  const propertyRows = await db.select().from(properties).where(sql`${properties.orgId} = ${NNACT_ORG_ID}`);
  counts.properties = propertyRows.length;

  const equipmentRows = await db.select().from(equipment).where(sql`${equipment.orgId} = ${NNACT_ORG_ID}`);
  counts.equipment = equipmentRows.length;

  const modelRows = await db.select().from(equipmentModels).where(sql`${equipmentModels.orgId} = ${NNACT_ORG_ID}`);
  counts.equipmentModels = modelRows.length;

  const jobRows = await db.select().from(jobs).where(sql`${jobs.orgId} = ${NNACT_ORG_ID}`);
  counts.jobs = jobRows.length;

  const apptRows = await db.select().from(appointments).where(sql`${appointments.orgId} = ${NNACT_ORG_ID}`);
  counts.appointments = apptRows.length;

  const invoiceRows = await db.select().from(invoices).where(sql`${invoices.orgId} = ${NNACT_ORG_ID}`);
  counts.invoices = invoiceRows.length;

  const paymentRows = await db.select().from(payments).where(sql`${payments.orgId} = ${NNACT_ORG_ID}`);
  counts.payments = paymentRows.length;

  const outcomeRows = await db.select().from(repairOutcomes).where(sql`${repairOutcomes.orgId} = ${NNACT_ORG_ID}`);
  counts.repairOutcomes = outcomeRows.length;

  return counts;
}

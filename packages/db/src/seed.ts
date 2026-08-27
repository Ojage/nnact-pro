// Demo seed for the integrated operations + appliance diagnostic product.
// Idempotent for the current demo organization name.
import {
  appointments,
  correctionReports,
  customers,
  db,
  diagnosticSessions,
  diagnosticSteps,
  diagnosticWorkflows,
  equipment,
  equipmentModels,
  knownFaults,
  symptoms,
  faultSymptoms,
  repairProcedures,
  testPoints,
  fieldMeasurements,
  modelParts,
  repairOutcomes,
  diagnosticWorkflowExtensions,
  invoices,
  jobEquipmentLinks,
  jobs,
  notifications,
  orgs,
  plugins,
  traceRoutes,
  users,
} from "./index.js";
import { eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";

const NOTIFY_EVENTS = ["job.created", "invoice.created", "invoice.paid", "payment.received"];
const FIRST_PARTY_PLUGINS = [
  { slug: "slack-notifier", name: "Slack", description: "Post job, invoice, and payment alerts to a Slack channel.", events: NOTIFY_EVENTS, scopes: [], transform: "slack" },
  { slug: "discord-notifier", name: "Discord", description: "Post job, invoice, and payment alerts to a Discord channel.", events: NOTIFY_EVENTS, scopes: [], transform: "discord" },
  { slug: "ntfy-notifier", name: "ntfy", description: "Push job, invoice, and payment alerts to your phone via ntfy.", events: NOTIFY_EVENTS, scopes: [], transform: "ntfy" },
  { slug: "google-maps", name: "Google Maps & Routing", description: "Geocode service addresses and optimize technician routes.", events: [], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "twilio-sms", name: "Twilio SMS", description: "Text customers on job and payment events.", events: ["job.created", "invoice.created", "payment.received"], scopes: ["jobs:read", "customers:read"], transform: "generic" },
  { slug: "resend-email", name: "Resend Email", description: "Send transactional email for invoices and estimates.", events: ["invoice.created", "estimate.accepted"], scopes: ["invoices:read", "customers:read"], transform: "generic" },
  { slug: "mailchimp", name: "Mailchimp", description: "Sync customers into a marketing audience.", events: ["customer.created"], scopes: ["customers:read"], transform: "generic" },
  { slug: "quickbooks", name: "QuickBooks Online", description: "Push paid invoices and payments into accounting.", events: ["invoice.paid", "payment.received"], scopes: ["invoices:read"], transform: "generic" },
  { slug: "zapier", name: "Zapier", description: "Fan field-service events out to automation workflows.", events: ["job.created", "job.updated", "invoice.created", "invoice.paid", "payment.received", "customer.created", "estimate.accepted"], scopes: ["*"], transform: "generic" },
] as const;

async function seedPlugins(): Promise<void> {
  await db
    .insert(plugins)
    .values(
      FIRST_PARTY_PLUGINS.map((plugin) => ({
        ...plugin,
        events: [...plugin.events],
        scopes: [...plugin.scopes],
        firstParty: true,
      })),
    )
    .onConflictDoNothing({ target: plugins.slug });
  console.log(`seed: ${FIRST_PARTY_PLUGINS.length} first-party plugin manifests ensured`);
}

function seedHash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  await seedPlugins();

  const existing = await db
    .select()
    .from(orgs)
    .where(eq(orgs.name, "Demo Appliance Service"));
  if (existing.length) {
    console.log("seed: Demo Appliance Service already exists, skipping demo data");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(orgs)
      .values({ name: "Demo Appliance Service", timezone: "America/Denver" })
      .returning();

    const [owner] = await tx
      .insert(users)
      .values({
        orgId: org.id,
        email: "owner@demo.test",
        name: "Dana Owner",
        role: "owner",
        passwordHash: seedHash("demo12345"),
      })
      .returning();

    const [alice, bob] = await tx
      .insert(customers)
      .values([
        { orgId: org.id, name: "Alice Johnson", email: "alice@example.com", phone: "555-0101" },
        { orgId: org.id, name: "Bob Smith", phone: "555-0102" },
      ])
      .returning();

    const [refrigerator, dryer] = await tx
      .insert(equipment)
      .values([
        {
          orgId: org.id,
          customerId: alice.id,
          type: "refrigerator",
          make: "KitchenAid",
          model: "KRFF507HPS03",
          serialNumber: "KAD-DEMO-507",
          installDate: new Date("2023-11-15"),
          notes: "Demo appliance for validated diagnostic workflow",
        },
        {
          orgId: org.id,
          customerId: bob.id,
          type: "electric_dryer",
          make: "Whirlpool",
          model: "WED5050LW0",
          serialNumber: "WHR-DEMO-505",
          installDate: new Date("2024-06-01"),
        },
      ])
      .returning();

    const appointmentStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const appointmentEnd = new Date(appointmentStart.getTime() + 90 * 60 * 1000);

    const [diagnosticJob, completedJob] = await tx
      .insert(jobs)
      .values([
        {
          orgId: org.id,
          customerId: alice.id,
          assignedTo: owner.id,
          title: "Refrigerator not cooling in fresh-food section",
          description: "Customer reports warm fresh-food compartment while freezer remains cold.",
          status: "scheduled",
          scheduledAt: appointmentStart,
          total: 0,
        },
        {
          orgId: org.id,
          customerId: bob.id,
          assignedTo: owner.id,
          title: "Dryer no heat — completed repair",
          status: "completed",
          scheduledAt: new Date(Date.now() - 86_400_000),
          total: 28900,
        },
      ])
      .returning();

    await tx.insert(appointments).values({
      orgId: org.id,
      jobId: diagnosticJob.id,
      technicianId: owner.id,
      startsAt: appointmentStart,
      endsAt: appointmentEnd,
    });

    await tx.insert(invoices).values({
      orgId: org.id,
      jobId: completedJob.id,
      number: "INV-1001",
      status: "sent",
      total: 28900,
    });

    const [workflow] = await tx
      .insert(diagnosticWorkflows)
      .values({
        orgId: org.id,
        name: "Fresh-food warm / evaporator airflow verification",
        productType: "refrigerator",
        make: "KitchenAid",
        modelFamily: "KRFF507HPS",
        versionNumber: 1,
        supportStatus: "validated",
        lifecycleStatus: "published",
        sourceRevision: "DEMO-TECH-REV-A",
        applicability: {
          models: ["KRFF507HPS03"],
          notes: ["Demonstration workflow; replace source references with authorized technical evidence."],
        },
        limitations: ["Demo values are illustrative and must not be used as real service data."],
        publishedAt: new Date(),
      })
      .returning();

    const [confirmCommand, verifySupply, verifyMotor] = await tx
      .insert(diagnosticSteps)
      .values([
        {
          orgId: org.id,
          workflowId: workflow.id,
          stepKey: "confirm-cooling-command",
          publicLabel: "Confirm active cooling command and recorded fault state",
          sequence: 0,
          mode: "guided",
          stepType: "decision",
          purpose: "Establish that the evaporator fan is being commanded before electrical testing.",
          operatingCondition: "Unit in active cooling operation",
          expectedText: "Cooling demand active; document any stored error codes",
          passInterpretation: "Continue to fan supply verification.",
          failInterpretation: "Resolve command, control, or sensor conditions before condemning the fan circuit.",
          branchRules: { passStepKey: "verify-fan-supply", failStepKey: "stop-no-command" },
          sourceRefs: [{ document: "DEMO-TECH", revision: "A", page: 1 }],
          validationStatus: "validated",
        },
        {
          orgId: org.id,
          workflowId: workflow.id,
          stepKey: "verify-fan-supply",
          publicLabel: "Verify evaporator fan supply under cooling command",
          sequence: 1,
          mode: "both",
          stepType: "check",
          purpose: "Determine whether the control and harness provide the expected fan supply.",
          safetyState: "Qualified technician live-voltage check",
          powerState: "Energized",
          operatingCondition: "Cooling active and evaporator fan commanded on",
          meterMode: "VAC",
          point1Label: "Main control fan output",
          point1Endpoint: "P8-3",
          point2Label: "Neutral reference",
          point2Endpoint: "P8-1",
          connector: "P8",
          pin: "3 to 1",
          wireColor: "Demo only",
          expectedText: "120 VAC (demonstration value only)",
          unit: "VAC",
          passInterpretation: "Supply path is present; continue to motor and connector verification.",
          failInterpretation: "Verify control input, output, connector condition, and harness before recommending a control.",
          branchRules: { passStepKey: "verify-fan-motor", failStepKey: "isolate-control-output" },
          sourceRefs: [{ document: "DEMO-TECH", revision: "A", page: 2 }],
          accessibilityNote: "Back-probe only with an appropriate insulated method.",
          validationStatus: "validated",
        },
        {
          orgId: org.id,
          workflowId: workflow.id,
          stepKey: "verify-fan-motor",
          publicLabel: "Verify evaporator fan motor winding",
          sequence: 2,
          mode: "both",
          stepType: "check",
          purpose: "Verify the load after source and return availability are established.",
          safetyState: "De-energized resistance check",
          powerState: "Power removed and connector isolated",
          operatingCondition: "Unit unplugged; motor connector disconnected",
          meterMode: "Resistance",
          point1Label: "Fan motor terminal 1",
          point1Endpoint: "EVAP-FAN-1",
          point2Label: "Fan motor terminal 2",
          point2Endpoint: "EVAP-FAN-2",
          connector: "Evaporator fan",
          pin: "1 to 2",
          wireColor: "Demo only",
          expectedText: "Within documented motor range",
          unit: "Ω",
          passInterpretation: "Motor winding is not open; inspect mechanical operation and loaded performance.",
          failInterpretation: "Open or out-of-range winding supports motor replacement after connector inspection.",
          sourceRefs: [{ document: "DEMO-TECH", revision: "A", page: 3 }],
          validationStatus: "validated",
        },
      ])
      .returning();

    await tx.insert(traceRoutes).values([
      {
        orgId: org.id,
        stepId: verifySupply.id,
        label: "Control fan output to neutral reference",
        routeKind: "controlled_output",
        endpoint1: "P8-3",
        endpoint2: "P8-1",
        segmentIds: ["DEMO-S001", "DEMO-S002", "DEMO-S003"],
        continuityValid: true,
        disconnectedIslands: 0,
        unintendedBranches: 0,
        visualAuditStatus: "passed",
        validationNotes: "Demonstration route only.",
      },
      {
        orgId: org.id,
        stepId: verifyMotor.id,
        label: "Across evaporator fan motor winding",
        routeKind: "across_load",
        endpoint1: "EVAP-FAN-1",
        endpoint2: "EVAP-FAN-2",
        segmentIds: ["DEMO-S010"],
        continuityValid: true,
        disconnectedIslands: 0,
        unintendedBranches: 0,
        visualAuditStatus: "passed",
        validationNotes: "Demonstration route only.",
      },
    ]);

    await tx.insert(jobEquipmentLinks).values({
      orgId: org.id,
      jobId: diagnosticJob.id,
      equipmentId: refrigerator.id,
      linkedBy: owner.id,
    });

    await tx.insert(diagnosticSessions).values({
      orgId: org.id,
      jobId: diagnosticJob.id,
      equipmentId: refrigerator.id,
      workflowId: workflow.id,
      workflowVersion: workflow.versionNumber,
      status: "workflow_ready",
      customerComplaint: "Fresh-food section is warm while the freezer still appears cold.",
      technicianObservation: "Diagnostic session created; physical observation pending arrival.",
      errorCodes: [],
      startedBy: owner.id,
    });

    // Keep the correction table exercised without creating an open defect.
    await tx.insert(correctionReports).values({
      orgId: org.id,
      workflowId: workflow.id,
      workflowVersion: workflow.versionNumber,
      stepId: confirmCommand.id,
      reportedBy: owner.id,
      category: "seed_validation",
      severity: "low",
      description: "Demo workflow seed reviewed during setup.",
      status: "fixed",
      rootCause: "Seed verification",
      resolution: "Confirmed demo content remains visibly labeled as illustrative.",
    });

    await tx.insert(notifications).values({
      orgId: org.id,
      userId: owner.id,
      type: "diagnostic.ready",
      title: `Diagnostic workflow ready for ${diagnosticJob.title}`,
      body: "The exact appliance and validated demonstration workflow are linked to today’s appointment.",
      link: "/diagnostics",
    });

    // ── Repair Brain demo knowledge (fictional sample records) ──────────
    const [samsungWasher, lgFridge, daikinAc, cworthInverter] = await tx
      .insert(equipmentModels)
      .values([
        {
          orgId: org.id,
          manufacturer: "Samsung",
          brand: "Samsung",
          modelNumber: "WW90T4040CE",
          modelName: "EcoBubble Washing Machine 9kg",
          category: "washing_machine",
          subcategory: "front_load",
          specifications: { capacity_kg: 9, voltage: "220-240V", spin_speed_rpm: 1400, motor_type: "digital_inverter" },
          aliases: ["WW90T4040", "WW90T"],
          normalizedIdentifier: "samsungww90t4040ce",
          createdBy: owner.id,
        },
        {
          orgId: org.id,
          manufacturer: "LG",
          brand: "LG",
          modelNumber: "GC-B247SLUV",
          modelName: "InstaView Refrigerator",
          category: "refrigerator",
          specifications: { capacity_liters: 247, refrigerant: "R600a", voltage: "220-240V" },
          normalizedIdentifier: "lggcb247sluv",
          createdBy: owner.id,
        },
        {
          orgId: org.id,
          manufacturer: "Daikin",
          modelNumber: "FTKF35",
          modelName: "Split AC 1.5HP",
          category: "ac_unit",
          specifications: { cooling_capacity_btu: 12000, refrigerant: "R32", voltage: "220-240V" },
          normalizedIdentifier: "daikinftkf35",
          createdBy: owner.id,
        },
        {
          orgId: org.id,
          manufacturer: "Cworth",
          modelNumber: "CW-HYB-5K",
          modelName: "5kW Hybrid Inverter",
          category: "inverter",
          specifications: { rated_power_kw: 5, battery_voltage: 48, battery_chemistry: "LiFePO4", pv_input_max_kw: 6.5 },
          normalizedIdentifier: "cworthcwhyb5k",
          createdBy: owner.id,
        },
      ])
      .returning();

    await tx
      .update(equipment)
      .set({ equipmentModelId: lgFridge.id })
      .where(eq(equipment.id, refrigerator.id));

    const [drainSymptom, waterRemainSymptom] = await tx
      .insert(symptoms)
      .values([
        { orgId: org.id, label: "Machine does not drain", normalizedLabel: "machine does not drain", category: "drainage" },
        { orgId: org.id, label: "Water remains in drum", normalizedLabel: "water remains in drum", category: "drainage" },
      ])
      .returning();

    const [drainFault] = await tx
      .insert(knownFaults)
      .values({
        orgId: org.id,
        equipmentModelId: samsungWasher.id,
        faultCode: "5C",
        normalizedFaultCode: "5c",
        title: "Does not drain",
        description: "Water remains in drum after cycle. Drain pump may be blocked or failed.",
        severity: "medium",
        frequency: "common",
        probableCauses: ["blocked filter", "blocked hose", "failed drain pump", "wiring fault", "control board issue"],
        safetyWarnings: ["electrical_hazard"],
        confidenceStatus: "repeated_success",
        verificationStatus: "verified",
        sourceType: "field_job",
        createdBy: owner.id,
        verifiedBy: owner.id,
        verifiedAt: new Date(),
      })
      .returning();

    await tx.insert(faultSymptoms).values([
      { orgId: org.id, faultId: drainFault.id, symptomId: drainSymptom.id },
      { orgId: org.id, faultId: drainFault.id, symptomId: waterRemainSymptom.id },
    ]);

    await tx.insert(repairProcedures).values({
      orgId: org.id,
      equipmentModelId: samsungWasher.id,
      knownFaultId: drainFault.id,
      title: "Replace drain pump",
      description: "Replace failed drain pump after confirming open circuit on winding.",
      safetyWarnings: ["electrical_hazard"],
      requiredTools: ["multimeter", "Torx T20", "pliers"],
      requiredParts: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A" }],
      steps: [
        { sequence: 1, instruction: "Unplug machine and isolate water supply.", warning: "electrical_hazard" },
        { sequence: 2, instruction: "Remove bottom access panel and drain filter." },
        { sequence: 3, instruction: "Disconnect pump wiring and hoses." },
        { sequence: 4, instruction: "Install replacement pump DC31-00181A." },
        { sequence: 5, instruction: "Run drain/spin test cycle.", verification: "No 5C error; drum drains completely." },
      ],
      expectedDurationMinutes: 45,
      skillLevel: "intermediate",
      verificationSteps: ["Run full drain cycle", "Confirm no error code"],
      confidenceStatus: "repeated_success",
      verificationStatus: "verified",
      createdBy: owner.id,
      verifiedBy: owner.id,
      verifiedAt: new Date(),
    });

    await tx.insert(testPoints).values({
      orgId: org.id,
      equipmentModelId: samsungWasher.id,
      component: "Drain pump",
      description: "Pump winding resistance at connector CN3",
      connector: "CN3",
      pin: "1-2",
      expectedMin: "150",
      expectedMax: "220",
      unit: "Ω",
      confidenceStatus: "technician_verified",
      verificationStatus: "verified",
      createdBy: owner.id,
    });

    const [drainPumpPart] = await tx
      .insert(modelParts)
      .values({
        orgId: org.id,
        equipmentModelId: samsungWasher.id,
        partName: "Drain pump assembly",
        oemPartNumber: "DC31-00181A",
        manufacturer: "Samsung",
        alternativePartNumber: "Askoll M231 XP",
        lastKnownPriceCents: 8500,
        reliabilityNotes: "OEM preferred; aftermarket Askoll acceptable when OEM unavailable.",
        confidenceStatus: "repeated_success",
        verificationStatus: "verified",
        createdBy: owner.id,
        verifiedBy: owner.id,
        verifiedAt: new Date(),
      })
      .returning();

    await tx.insert(repairOutcomes).values({
      orgId: org.id,
      jobId: completedJob.id,
      equipmentId: dryer.id,
      equipmentModelId: samsungWasher.id,
      knownFaultId: drainFault.id,
      outcome: "successful",
      whatWasDone: "Replaced drain pump after measuring open circuit on winding.",
      partsUsed: [{ partName: "Drain pump", oemPartNumber: "DC31-00181A", quantity: 1 }],
      laborMinutes: 50,
      technicianId: owner.id,
      machineStatus: "operational",
      technicianConfidence: 5,
      customerOutcome: "Satisfied — machine drains normally",
      conclusion: "Drain pump failed — open circuit confirmed.",
      isFailedAttempt: false,
    });

    await tx.insert(diagnosticWorkflowExtensions).values({
      orgId: org.id,
      workflowId: workflow.id,
      equipmentModelId: lgFridge.id,
    });

    console.log(
      `seed: Repair Brain demo — ${samsungWasher.modelNumber}, ${lgFridge.modelNumber}, ${daikinAc.modelNumber}, ${cworthInverter.modelNumber}; drain pump ${drainPumpPart.oemPartNumber}`,
    );

    console.log(
      `seed: created appliance-service org ${org.id} with workflow ${workflow.id} and diagnostic session`,
    );
  });

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

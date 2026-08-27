/**
 * NNACT Institutional Repair Brain — business logic.
 */
import { eq, and, or, ilike, sql, desc, inArray } from "drizzle-orm";
import {
  db,
  equipmentModels,
  knownFaults,
  symptoms,
  faultSymptoms,
  knowledgeProposals,
  knowledgeRevisions,
  repairOutcomes,
  modelParts,
  repairProcedures,
  technicalDocuments,
  diagnosticWorkflows,
  diagnosticWorkflowExtensions,
  diagnosticSessions,
  fieldMeasurements,
  equipment,
  jobs,
  jobEquipmentLinks,
  catalogItems,
} from "@nnact/db";
import {
  normalizeModelIdentifier,
  normalizeFaultCode,
  normalizeSymptomLabel,
  type KnowledgeConfidence,
  type KnowledgeProposalStatus,
} from "@nnact/shared";

export { normalizeModelIdentifier, normalizeFaultCode, normalizeSymptomLabel };

export interface CreateEquipmentModelInput {
  manufacturer: string;
  brand?: string;
  modelNumber: string;
  modelName?: string;
  variant?: string;
  category: string;
  subcategory?: string;
  productFamily?: string;
  manufactureYears?: { from?: number; to?: number };
  specifications?: Record<string, unknown>;
  aliases?: string[];
  notes?: string;
}

/** Promote confidence after repeated successful repairs (full ladder — manual use only). */
export function nextConfidenceAfterSuccess(current: KnowledgeConfidence): KnowledgeConfidence {
  const ladder: KnowledgeConfidence[] = [
    "unverified",
    "field_observation",
    "repeated_success",
    "technician_verified",
    "senior_verified",
    "manufacturer_confirmed",
  ];
  const idx = ladder.indexOf(current);
  if (idx < 0 || idx >= ladder.length - 1) return current;
  return ladder[idx + 1]!;
}

/** Automatic confidence promotion stops at repeated_success — higher tiers need explicit human verification. */
export function autoPromoteConfidenceAfterSuccess(current: KnowledgeConfidence): KnowledgeConfidence {
  if (
    current === "repeated_success" ||
    current === "technician_verified" ||
    current === "senior_verified" ||
    current === "manufacturer_confirmed"
  ) {
    return current;
  }
  const next = nextConfidenceAfterSuccess(current);
  if (next === "technician_verified" || next === "senior_verified" || next === "manufacturer_confirmed") {
    return "repeated_success";
  }
  return next;
}

/** Rank known faults by symptom overlap (rule-based, no AI). */
export function rankFaultsBySymptoms(
  faults: Array<{ id: string; title: string; faultCode?: string | null; description?: string | null }>,
  faultToSymptomIds: Map<string, string[]>,
  symptomIdToLabel: Map<string, string>,
  selectedLabels: string[],
): Array<{ faultId: string; title: string; faultCode?: string | null; score: number; matchedSymptoms: string[] }> {
  const normalizedSelected = selectedLabels.map(normalizeSymptomLabel);
  const scores = new Map<string, { score: number; matchedSymptoms: string[] }>();

  for (const fault of faults) {
    const linked = faultToSymptomIds.get(fault.id) ?? [];
    const matched: string[] = [];
    for (const sid of linked) {
      const label = symptomIdToLabel.get(sid);
      if (label && normalizedSelected.includes(normalizeSymptomLabel(label))) {
        matched.push(label);
      }
    }
    for (const sel of normalizedSelected) {
      const title = fault.title.toLowerCase();
      const desc = (fault.description ?? "").toLowerCase();
      const code = (fault.faultCode ?? "").toLowerCase();
      if (title.includes(sel) || desc.includes(sel) || (code && sel.includes(code))) {
        if (!matched.some((m) => normalizeSymptomLabel(m) === sel)) {
          matched.push(sel);
        }
      }
    }
    if (matched.length > 0) {
      scores.set(fault.id, { score: matched.length, matchedSymptoms: matched });
    }
  }

  return faults
    .filter((f) => scores.has(f.id))
    .map((f) => ({
      faultId: f.id,
      title: f.title,
      faultCode: f.faultCode,
      score: scores.get(f.id)!.score,
      matchedSymptoms: scores.get(f.id)!.matchedSymptoms,
    }))
    .sort((a, b) => b.score - a.score);
}

export interface ProposalDraftInput {
  jobId: string;
  equipmentId?: string;
  equipmentModelId?: string;
  session?: {
    id: string;
    customerComplaint?: string | null;
    summary?: string | null;
    errorCodes?: string[];
    knownFaultId?: string | null;
  } | null;
  outcomes: Array<{
    outcome: string;
    whatWasDone?: string | null;
    partsUsed?: Array<{ partName: string; oemPartNumber?: string; quantity?: number }>;
    conclusion?: string | null;
    isFailedAttempt?: boolean;
  }>;
  measurements: Array<{
    parameter: string;
    observedValue?: string | null;
    unit?: string | null;
    result: string;
    expectedMin?: string | null;
    expectedMax?: string | null;
  }>;
  knownFault?: { id: string; title: string; faultCode?: string | null } | null;
}

/** Build a pre-filled knowledge proposal payload from job field data. */
export function buildProposalDraft(input: ProposalDraftInput) {
  const successful = input.outcomes.find((o) => o.outcome === "successful" && !o.isFailedAttempt);
  const latest = successful ?? input.outcomes[0];
  const failedAttempts = input.outcomes.filter((o) => o.isFailedAttempt);

  const title =
    input.knownFault?.title ??
    (input.session?.customerComplaint ? input.session.customerComplaint.slice(0, 80) : "Field repair finding");

  const payload: Record<string, unknown> = {
    title,
    faultCode: input.knownFault?.faultCode ?? input.session?.errorCodes?.[0],
    description: input.session?.summary ?? latest?.conclusion,
    symptoms: input.session?.customerComplaint ? [input.session.customerComplaint] : [],
    probableCauses: [],
    whatWasDone: latest?.whatWasDone,
    partsUsed: latest?.partsUsed ?? [],
    measurements: input.measurements.map((m) => ({
      parameter: m.parameter,
      observedValue: m.observedValue,
      unit: m.unit,
      result: m.result,
      expected: m.expectedMin && m.expectedMax ? `${m.expectedMin}–${m.expectedMax}` : undefined,
    })),
    failedAttempts: failedAttempts.map((a) => ({
      action: a.whatWasDone,
      conclusion: a.conclusion,
    })),
    knownFaultId: input.knownFault?.id ?? input.session?.knownFaultId,
  };

  let proposalType: "fault" | "repair_procedure" | "part" | "measurement" = "fault";
  if (latest?.partsUsed?.length && !input.knownFault) proposalType = "part";
  else if (input.measurements.length > 0 && !latest?.whatWasDone) proposalType = "measurement";
  else if (latest?.whatWasDone) proposalType = "repair_procedure";

  if (proposalType === "repair_procedure" && latest?.whatWasDone) {
    payload.steps = [{ sequence: 1, instruction: latest.whatWasDone }];
    payload.title = latest.whatWasDone.slice(0, 80);
  }
  if (proposalType === "part" && latest?.partsUsed?.[0]) {
    payload.partName = latest.partsUsed[0].partName;
    payload.oemPartNumber = latest.partsUsed[0].oemPartNumber;
  }

  return {
    proposalType,
    title,
    payload,
    sourceJobId: input.jobId,
    sourceEquipmentId: input.equipmentId,
    sourceSessionId: input.session?.id,
    sourceRepairOutcomeId: undefined as string | undefined,
    equipmentModelId: input.equipmentModelId,
  };
}

export async function findExistingModel(orgId: string, manufacturer: string, modelNumber: string) {
  const normalized = normalizeModelIdentifier(manufacturer, modelNumber);
  const [existing] = await db
    .select()
    .from(equipmentModels)
    .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.normalizedIdentifier, normalized)))
    .limit(1);
  return existing ?? null;
}

export async function upsertEquipmentModel(
  orgId: string,
  input: CreateEquipmentModelInput,
  createdBy?: string,
) {
  const existing = await findExistingModel(orgId, input.manufacturer, input.modelNumber);
  if (existing) return { model: existing, created: false };

  const normalized = normalizeModelIdentifier(input.manufacturer, input.modelNumber);
  const [model] = await db
    .insert(equipmentModels)
    .values({
      orgId,
      manufacturer: input.manufacturer,
      brand: input.brand,
      modelNumber: input.modelNumber,
      modelName: input.modelName,
      variant: input.variant,
      category: input.category,
      subcategory: input.subcategory,
      productFamily: input.productFamily,
      manufactureYears: input.manufactureYears ?? null,
      specifications: input.specifications ?? {},
      aliases: input.aliases ?? [],
      normalizedIdentifier: normalized,
      notes: input.notes,
      createdBy,
    })
    .returning();
  return { model, created: true };
}

export async function findSimilarFaults(
  orgId: string,
  equipmentModelId: string,
  title: string,
  faultCode?: string,
) {
  const titleTerm = `%${title.trim()}%`;
  const codeConditions = faultCode
    ? [eq(knownFaults.normalizedFaultCode, normalizeFaultCode(faultCode))]
    : [];
  return db
    .select()
    .from(knownFaults)
    .where(
      and(
        eq(knownFaults.orgId, orgId),
        eq(knownFaults.equipmentModelId, equipmentModelId),
        or(ilike(knownFaults.title, titleTerm), ...codeConditions),
      ),
    )
    .limit(10);
}

export async function upsertSymptom(orgId: string, label: string, createdBy?: string) {
  const normalizedLabel = normalizeSymptomLabel(label);
  const [existing] = await db
    .select()
    .from(symptoms)
    .where(and(eq(symptoms.orgId, orgId), eq(symptoms.normalizedLabel, normalizedLabel)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(symptoms)
    .values({ orgId, label: label.trim(), normalizedLabel, createdBy })
    .returning();
  return created;
}

export async function recordKnowledgeRevision(
  orgId: string,
  entityType: string,
  entityId: string,
  snapshot: Record<string, unknown>,
  changedBy?: string,
  changeReason?: string,
) {
  await db.insert(knowledgeRevisions).values({
    orgId,
    entityType,
    entityId,
    snapshot,
    changedBy,
    changeReason,
  });
}

export async function countSuccessfulRepairsForFault(orgId: string, knownFaultId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(repairOutcomes)
    .where(
      and(
        eq(repairOutcomes.orgId, orgId),
        eq(repairOutcomes.knownFaultId, knownFaultId),
        eq(repairOutcomes.outcome, "successful"),
        eq(repairOutcomes.isFailedAttempt, false),
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function advanceProposalStatus(
  orgId: string,
  proposalId: string,
  newStatus: KnowledgeProposalStatus,
  actorId: string,
  reviewNotes?: string,
) {
  const updates: Record<string, unknown> = {
    status: newStatus,
    reviewNotes,
    updatedAt: new Date(),
  };
  if (newStatus === "reviewed") updates.reviewedBy = actorId;
  if (newStatus === "verified") updates.verifiedBy = actorId;

  const [proposal] = await db
    .update(knowledgeProposals)
    .set(updates)
    .where(and(eq(knowledgeProposals.orgId, orgId), eq(knowledgeProposals.id, proposalId)))
    .returning();
  return proposal ?? null;
}

export async function materializeProposal(orgId: string, proposalId: string, verifiedBy: string) {
  const [proposal] = await db
    .select()
    .from(knowledgeProposals)
    .where(and(eq(knowledgeProposals.orgId, orgId), eq(knowledgeProposals.id, proposalId)));
  if (!proposal) return null;

  const payload = proposal.payload as Record<string, unknown>;
  let targetEntityType: string | null = null;
  let targetEntityId: string | null = null;

  switch (proposal.proposalType) {
    case "fault": {
      const [fault] = await db
        .insert(knownFaults)
        .values({
          orgId,
          equipmentModelId: proposal.equipmentModelId!,
          faultCode: payload.faultCode as string | undefined,
          normalizedFaultCode: payload.faultCode
            ? normalizeFaultCode(payload.faultCode as string)
            : undefined,
          title: (payload.title as string) ?? proposal.title,
          description: payload.description as string | undefined,
          probableCauses: (payload.probableCauses as string[]) ?? [],
          safetyWarnings: (payload.safetyWarnings as never[]) ?? [],
          confidenceStatus: "field_observation",
          verificationStatus: "proposed",
          sourceType: "field_job",
          sourceJobId: proposal.sourceJobId,
          sourceEquipmentId: proposal.sourceEquipmentId,
          createdBy: proposal.proposedBy,
        })
        .returning();
      targetEntityType = "known_fault";
      targetEntityId = fault.id;
      for (const label of (payload.symptoms as string[]) ?? []) {
        const symptom = await upsertSymptom(orgId, label, verifiedBy);
        await db
          .insert(faultSymptoms)
          .values({ orgId, faultId: fault.id, symptomId: symptom.id })
          .onConflictDoNothing();
      }
      break;
    }
    case "part": {
      const [part] = await db
        .insert(modelParts)
        .values({
          orgId,
          equipmentModelId: proposal.equipmentModelId!,
          partName: (payload.partName as string) ?? proposal.title,
          oemPartNumber: payload.oemPartNumber as string | undefined,
          confidenceStatus: "field_observation",
          verificationStatus: "proposed",
          createdBy: proposal.proposedBy,
        })
        .returning();
      targetEntityType = "model_part";
      targetEntityId = part.id;
      break;
    }
    case "repair_procedure": {
      const [procedure] = await db
        .insert(repairProcedures)
        .values({
          orgId,
          equipmentModelId: proposal.equipmentModelId!,
          knownFaultId: payload.knownFaultId as string | undefined,
          title: (payload.title as string) ?? proposal.title,
          steps: (payload.steps as never[]) ?? [],
          confidenceStatus: "field_observation",
          verificationStatus: "proposed",
          sourceType: "field_job",
          sourceJobId: proposal.sourceJobId,
          createdBy: proposal.proposedBy,
        })
        .returning();
      targetEntityType = "repair_procedure";
      targetEntityId = procedure.id;
      break;
    }
    default:
      break;
  }

  await db
    .update(knowledgeProposals)
    .set({
      status: "verified",
      verifiedBy,
      targetEntityType,
      targetEntityId,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeProposals.id, proposalId));

  return { proposal, targetEntityType, targetEntityId };
}

export async function getModelRepairStats(orgId: string, equipmentModelId: string) {
  const outcomes = await db
    .select()
    .from(repairOutcomes)
    .where(
      and(
        eq(repairOutcomes.orgId, orgId),
        eq(repairOutcomes.equipmentModelId, equipmentModelId),
        eq(repairOutcomes.isFailedAttempt, false),
      ),
    );

  const byFault = new Map<string, { count: number; solutions: Map<string, number> }>();
  for (const o of outcomes) {
    const faultKey = o.knownFaultId ?? "unknown";
    const entry = byFault.get(faultKey) ?? { count: 0, solutions: new Map() };
    entry.count++;
    if (o.outcome === "successful" && o.whatWasDone) {
      entry.solutions.set(o.whatWasDone, (entry.solutions.get(o.whatWasDone) ?? 0) + 1);
    }
    byFault.set(faultKey, entry);
  }

  const successful = outcomes.filter((o) => o.outcome === "successful").length;
  const avgLabor =
    outcomes.length > 0
      ? Math.round(outcomes.reduce((sum, o) => sum + (o.laborMinutes ?? 0), 0) / outcomes.length)
      : 0;

  return {
    totalRepairs: outcomes.length,
    successfulRepairs: successful,
    averageLaborMinutes: avgLabor,
    byFault: Object.fromEntries(
      [...byFault.entries()].map(([k, v]) => [
        k,
        {
          count: v.count,
          topSolutions: [...v.solutions.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([action, count]) => ({ action, count })),
        },
      ]),
    ),
  };
}

export async function getJobRepairBrainContext(orgId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) return null;

  const [linkRow] = await db
    .select({ link: jobEquipmentLinks, equipment })
    .from(jobEquipmentLinks)
    .innerJoin(equipment, eq(jobEquipmentLinks.equipmentId, equipment.id))
    .where(and(eq(jobEquipmentLinks.orgId, orgId), eq(jobEquipmentLinks.jobId, jobId)));

  const sessions = await db
    .select({ session: diagnosticSessions, workflow: diagnosticWorkflows })
    .from(diagnosticSessions)
    .leftJoin(diagnosticWorkflows, eq(diagnosticSessions.workflowId, diagnosticWorkflows.id))
    .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.jobId, jobId)))
    .orderBy(desc(diagnosticSessions.updatedAt));

  const linkedEquipment = linkRow?.equipment ?? null;
  const primarySession = sessions[0] ?? null;
  const equipmentId = linkedEquipment?.id ?? primarySession?.session.equipmentId;
  let instance = linkedEquipment;
  if (!instance && equipmentId) {
    const [row] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, equipmentId)));
    instance = row ?? null;
  }

  let model = null;
  const modelId = instance?.equipmentModelId ?? primarySession?.session.equipmentModelId;
  if (modelId) {
    const [m] = await db
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, modelId)));
    model = m ?? null;
  }

  const faults = model
    ? await db.select().from(knownFaults).where(eq(knownFaults.equipmentModelId, model.id))
    : [];

  const modelSymptoms = await db
    .select()
    .from(symptoms)
    .where(eq(symptoms.orgId, orgId))
    .limit(200);

  const parts = model
    ? await db.select().from(modelParts).where(eq(modelParts.equipmentModelId, model.id))
    : [];

  const catalog = await db
    .select({ id: catalogItems.id, name: catalogItems.name, priceCents: catalogItems.priceCents })
    .from(catalogItems)
    .where(and(eq(catalogItems.orgId, orgId), eq(catalogItems.active, true)))
    .limit(100);

  const outcomes = await db
    .select()
    .from(repairOutcomes)
    .where(and(eq(repairOutcomes.orgId, orgId), eq(repairOutcomes.jobId, jobId)))
    .orderBy(desc(repairOutcomes.createdAt));

  const sessionIds = sessions.map((s) => s.session.id);
  const measurements =
    sessionIds.length > 0
      ? await db
          .select()
          .from(fieldMeasurements)
          .where(
            and(eq(fieldMeasurements.orgId, orgId), inArray(fieldMeasurements.sessionId, sessionIds)),
          )
          .orderBy(desc(fieldMeasurements.recordedAt))
      : [];

  const repairStats = model ? await getModelRepairStats(orgId, model.id) : null;

  const proposals = await db
    .select()
    .from(knowledgeProposals)
    .where(and(eq(knowledgeProposals.orgId, orgId), eq(knowledgeProposals.sourceJobId, jobId)));

  return {
    job: { id: job.id, title: job.title, status: job.status, description: job.description },
    equipment: instance,
    equipmentModel: model,
    knownFaults: faults,
    availableSymptoms: modelSymptoms,
    modelParts: parts,
    catalogItems: catalog,
    diagnosticSessions: sessions.map((s) => ({ ...s.session, workflow: s.workflow })),
    repairOutcomes: outcomes,
    fieldMeasurements: measurements,
    repairStats,
    knowledgeProposals: proposals,
  };
}

export async function suggestFaultsFromSymptoms(
  orgId: string,
  equipmentModelId: string,
  symptomLabels: string[],
) {
  const faults = await db
    .select()
    .from(knownFaults)
    .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.equipmentModelId, equipmentModelId)));
  if (faults.length === 0 || symptomLabels.length === 0) return [];

  const links = await db
    .select({ faultId: faultSymptoms.faultId, symptomId: faultSymptoms.symptomId })
    .from(faultSymptoms)
    .where(eq(faultSymptoms.orgId, orgId));

  const allSymptoms = await db.select().from(symptoms).where(eq(symptoms.orgId, orgId));
  const faultToSymptomIds = new Map<string, string[]>();
  for (const link of links) {
    const arr = faultToSymptomIds.get(link.faultId) ?? [];
    arr.push(link.symptomId);
    faultToSymptomIds.set(link.faultId, arr);
  }
  const symptomIdToLabel = new Map(allSymptoms.map((s) => [s.id, s.label]));

  return rankFaultsBySymptoms(faults, faultToSymptomIds, symptomIdToLabel, symptomLabels);
}

export async function getWorkflowsForFault(orgId: string, knownFaultId: string) {
  return db
    .select({ workflow: diagnosticWorkflows, ext: diagnosticWorkflowExtensions })
    .from(diagnosticWorkflowExtensions)
    .innerJoin(diagnosticWorkflows, eq(diagnosticWorkflowExtensions.workflowId, diagnosticWorkflows.id))
    .where(
      and(
        eq(diagnosticWorkflowExtensions.orgId, orgId),
        eq(diagnosticWorkflowExtensions.knownFaultId, knownFaultId),
      ),
    );
}

export async function linkEquipmentToModel(orgId: string, equipmentId: string, createdBy?: string) {
  const [inst] = await db
    .select()
    .from(equipment)
    .where(and(eq(equipment.orgId, orgId), eq(equipment.id, equipmentId)));
  if (!inst) return null;
  if (inst.equipmentModelId) {
    const [existing] = await db
      .select()
      .from(equipmentModels)
      .where(eq(equipmentModels.id, inst.equipmentModelId));
    return { equipment: inst, model: existing ?? null, created: false };
  }
  if (!inst.make || !inst.model) {
    return { equipment: inst, model: null, created: false, error: "make_and_model_required" as const };
  }

  const { model, created } = await upsertEquipmentModel(
    orgId,
    { manufacturer: inst.make, brand: inst.make, modelNumber: inst.model, category: inst.type },
    createdBy,
  );

  const [updated] = await db
    .update(equipment)
    .set({ equipmentModelId: model.id })
    .where(eq(equipment.id, equipmentId))
    .returning();

  return { equipment: updated, model, created };
}

export async function searchRepairBrain(orgId: string, query: string, limit = 8) {
  const term = `%${query.trim()}%`;

  const [models, faults, parts, procedures, documents, repairHistory] = await Promise.all([
    db
      .select({
        id: equipmentModels.id,
        manufacturer: equipmentModels.manufacturer,
        modelNumber: equipmentModels.modelNumber,
        modelName: equipmentModels.modelName,
        category: equipmentModels.category,
      })
      .from(equipmentModels)
      .where(
        and(
          eq(equipmentModels.orgId, orgId),
          or(
            ilike(equipmentModels.manufacturer, term),
            ilike(equipmentModels.modelNumber, term),
            ilike(equipmentModels.modelName, term),
            ilike(equipmentModels.brand, term),
          ),
        ),
      )
      .limit(limit),
    db
      .select({
        id: knownFaults.id,
        equipmentModelId: knownFaults.equipmentModelId,
        title: knownFaults.title,
        faultCode: knownFaults.faultCode,
      })
      .from(knownFaults)
      .where(
        and(
          eq(knownFaults.orgId, orgId),
          or(
            ilike(knownFaults.title, term),
            ilike(knownFaults.faultCode, term),
            ilike(knownFaults.description, term),
          ),
        ),
      )
      .limit(limit),
    db
      .select({
        id: modelParts.id,
        equipmentModelId: modelParts.equipmentModelId,
        partName: modelParts.partName,
        oemPartNumber: modelParts.oemPartNumber,
      })
      .from(modelParts)
      .where(
        and(
          eq(modelParts.orgId, orgId),
          or(
            ilike(modelParts.partName, term),
            ilike(modelParts.oemPartNumber, term),
            ilike(modelParts.alternativePartNumber, term),
          ),
        ),
      )
      .limit(limit),
    db
      .select({
        id: repairProcedures.id,
        equipmentModelId: repairProcedures.equipmentModelId,
        title: repairProcedures.title,
      })
      .from(repairProcedures)
      .where(and(eq(repairProcedures.orgId, orgId), ilike(repairProcedures.title, term)))
      .limit(limit),
    db
      .select({
        id: technicalDocuments.id,
        title: technicalDocuments.title,
        documentType: technicalDocuments.documentType,
        equipmentModelId: technicalDocuments.equipmentModelId,
      })
      .from(technicalDocuments)
      .where(and(eq(technicalDocuments.orgId, orgId), ilike(technicalDocuments.title, term)))
      .limit(limit),
    db
      .select({
        id: repairOutcomes.id,
        equipmentModelId: repairOutcomes.equipmentModelId,
        outcome: repairOutcomes.outcome,
        conclusion: repairOutcomes.conclusion,
      })
      .from(repairOutcomes)
      .where(
        and(
          eq(repairOutcomes.orgId, orgId),
          or(ilike(repairOutcomes.conclusion, term), ilike(repairOutcomes.whatWasDone, term)),
        ),
      )
      .limit(limit),
  ]);

  const diagnosticProcedures = await db
    .select({
      id: diagnosticWorkflows.id,
      name: diagnosticWorkflows.name,
    })
    .from(diagnosticWorkflows)
    .where(
      and(
        eq(diagnosticWorkflows.orgId, orgId),
        or(
          ilike(diagnosticWorkflows.name, term),
          ilike(diagnosticWorkflows.make, term),
          ilike(diagnosticWorkflows.modelFamily, term),
        ),
      ),
    )
    .limit(limit);

  return {
    models,
    faults,
    parts,
    procedures: [
      ...procedures.map((p) => ({ ...p, type: "repair" as const })),
      ...diagnosticProcedures.map((p) => ({
        id: p.id,
        equipmentModelId: "",
        title: p.name,
        type: "diagnostic" as const,
      })),
    ],
    documents,
    repairHistory,
  };
}

export async function linkWorkflowToModel(
  orgId: string,
  workflowId: string,
  equipmentModelId: string,
  knownFaultId?: string,
) {
  const [ext] = await db
    .insert(diagnosticWorkflowExtensions)
    .values({ orgId, workflowId, equipmentModelId, knownFaultId })
    .onConflictDoUpdate({
      target: diagnosticWorkflowExtensions.workflowId,
      set: { equipmentModelId, knownFaultId },
    })
    .returning();
  return ext;
}

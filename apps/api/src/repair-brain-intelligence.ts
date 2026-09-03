/**
 * NNACT Repair Brain — Engineering Intelligence.
 *
 * Built on top of the "institutional repair brain": a universal equipment
 * knowledge graph with a normalized category → manufacturer → system →
 * subsystem → component → connector → terminal → measurement-point
 * taxonomy, plus first-class error codes, operating sequences, service
 * modes and published knowledge articles. Templates are config-driven so
 * washers, refrigerators and air conditioners expose different navigation
 * without code changes.
 */
import { eq, and, desc, asc, ilike } from "drizzle-orm";
import {
  db,
  equipmentCategories,
  equipmentModels,
  manufacturers,
  equipmentSystems,
  equipmentSubsystems,
  equipmentComponents,
  equipmentConnectors,
  equipmentTerminals,
  measurementPoints,
  knowledgeTemplateSections,
  equipmentErrorCodes,
  operatingSequences,
  serviceModes,
  knowledgeArticles,
  knowledgeEdges,
} from "@nnact/db";
import {
  slugifyName,
  type EquipmentCategoryDTO,
  type EquipmentCategoryTemplate,
  type ManufacturerDTO,
  type EquipmentSystemDTO,
  type EquipmentSubsystemDTO,
  type EquipmentComponentDTO,
  type EquipmentConnectorDTO,
  type EquipmentTerminalDTO,
  type MeasurementPointDTO,
  type KnowledgeTemplateSectionDTO,
  type EquipmentErrorCodeDTO,
  type OperatingSequenceDTO,
  type ServiceModeDTO,
  type KnowledgeArticleDTO,
  type KnowledgeEdgeDTO,
  type EquipmentTaxonomyDTO,
  type SafetyWarning,
  type KnowledgeTemplateSection,
} from "@nnact/shared";

// ── Mappers ────────────────────────────────────────────────────────────

function iso(v: Date | string | null | undefined): string {
  return v ? new Date(v).toISOString() : new Date(0).toISOString();
}

export function toCategoryDTO(row: typeof equipmentCategories.$inferSelect): EquipmentCategoryDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    subcategory: row.subcategory,
    productFamily: row.productFamily,
    description: row.description,
    template: row.template as EquipmentCategoryTemplate,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toManufacturerDTO(row: typeof manufacturers.$inferSelect): ManufacturerDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    country: row.country,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toSystemDTO(row: typeof equipmentSystems.$inferSelect): EquipmentSystemDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    reference: row.reference,
    description: row.description,
    ordinal: row.ordinal,
  };
}

export function toSubsystemDTO(row: typeof equipmentSubsystems.$inferSelect): EquipmentSubsystemDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    systemId: row.systemId,
    name: row.name,
    slug: row.slug,
    reference: row.reference,
    description: row.description,
    ordinal: row.ordinal,
  };
}

export function toComponentDTO(row: typeof equipmentComponents.$inferSelect): EquipmentComponentDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    subsystemId: row.subsystemId,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    reference: row.reference,
    manufacturerPartNumber: row.manufacturerPartNumber,
    description: row.description,
    ordinal: row.ordinal,
  };
}

export function toConnectorDTO(row: typeof equipmentConnectors.$inferSelect): EquipmentConnectorDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    componentId: row.componentId,
    board: row.board,
    label: row.label,
    description: row.description,
    ordinal: row.ordinal,
  };
}

export function toTerminalDTO(row: typeof equipmentTerminals.$inferSelect): EquipmentTerminalDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    connectorId: row.connectorId,
    pin: row.pin,
    signal: row.signal,
    wireColor: row.wireColor,
    description: row.description,
    ordinal: row.ordinal,
  };
}

export function toMeasurementPointDTO(
  row: typeof measurementPoints.$inferSelect,
): MeasurementPointDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    componentId: row.componentId,
    connectorId: row.connectorId,
    name: row.name,
    parameter: row.parameter,
    unit: row.unit,
    expectedMin: row.expectedMin,
    expectedMax: row.expectedMax,
    expectedExact: row.expectedExact,
    measurementConditions: row.measurementConditions,
    instrumentRequired: row.instrumentRequired,
    safetyNotes: row.safetyNotes,
    reference: row.reference,
  };
}

export function toTemplateSectionDTO(
  row: typeof knowledgeTemplateSections.$inferSelect,
): KnowledgeTemplateSectionDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    categoryId: row.categoryId,
    sectionKey: row.sectionKey,
    label: row.label,
    group: row.group,
    kind: row.kind,
    ordinal: row.ordinal,
  };
}

export function toErrorCodeDTO(row: typeof equipmentErrorCodes.$inferSelect): EquipmentErrorCodeDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentModelId: row.equipmentModelId,
    systemId: row.systemId,
    code: row.code,
    normalizedCode: row.normalizedCode,
    meaning: row.meaning,
    description: row.description,
    preconditions: row.preconditions,
    likelyCauses: row.likelyCauses,
    correctiveActions: row.correctiveActions,
    severity: row.severity,
    confidenceStatus: row.confidenceStatus,
    verificationStatus: row.verificationStatus,
    revision: row.revision,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toSequenceDTO(row: typeof operatingSequences.$inferSelect): OperatingSequenceDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentModelId: row.equipmentModelId,
    systemId: row.systemId,
    name: row.name,
    phase: row.phase,
    description: row.description,
    steps: row.steps,
    ordinal: row.ordinal,
  };
}

export function toServiceModeDTO(row: typeof serviceModes.$inferSelect): ServiceModeDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentModelId: row.equipmentModelId,
    name: row.name,
    entryProcedure: row.entryProcedure,
    parameters: row.parameters,
    description: row.description,
    safetyWarnings: row.safetyWarnings,
  };
}

export function toArticleDTO(row: typeof knowledgeArticles.$inferSelect): KnowledgeArticleDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentModelId: row.equipmentModelId,
    categoryId: row.categoryId,
    title: row.title,
    slug: row.slug,
    kind: row.kind,
    body: row.body,
    summary: row.summary,
    tags: row.tags,
    verificationStatus: row.verificationStatus,
    revision: row.revision,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toEdgeDTO(row: typeof knowledgeEdges.$inferSelect): KnowledgeEdgeDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    relationship: row.relationship,
    targetType: row.targetType,
    targetId: row.targetId,
    meta: row.meta,
    createdAt: iso(row.createdAt),
  };
}

// ── Categories + config-driven templates ───────────────────────────────

export async function listCategories(orgId: string): Promise<EquipmentCategoryDTO[]> {
  const rows = await db
    .select()
    .from(equipmentCategories)
    .where(eq(equipmentCategories.orgId, orgId))
    .orderBy(asc(equipmentCategories.name));
  return rows.map(toCategoryDTO);
}

export async function getCategory(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(equipmentCategories)
    .where(and(eq(equipmentCategories.orgId, orgId), eq(equipmentCategories.id, id)));
  return row ?? null;
}

export async function createCategory(
  orgId: string,
  input: {
    name: string;
    subcategory?: string;
    productFamily?: string;
    description?: string;
    template?: EquipmentCategoryTemplate;
    createdBy?: string;
  },
) {
  const slug = input.name.trim() === "" ? "untitled" : slugifyName(input.name);
  const [row] = await db
    .insert(equipmentCategories)
    .values({
      orgId,
      name: input.name,
      slug,
      subcategory: input.subcategory,
      productFamily: input.productFamily,
      description: input.description,
      template: input.template ?? { sections: [] },
      createdById: input.createdBy,
    })
    .onConflictDoNothing({ target: [equipmentCategories.orgId, equipmentCategories.slug] })
    .returning();
  if (!row) return null;
  return toCategoryDTO(row);
}

export async function updateCategory(
  orgId: string,
  id: string,
  patch: {
    name?: string;
    subcategory?: string | null;
    productFamily?: string | null;
    description?: string | null;
    template?: EquipmentCategoryTemplate;
  },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    set.slug = slugifyName(patch.name);
  }
  if (patch.subcategory !== undefined) set.subcategory = patch.subcategory;
  if (patch.productFamily !== undefined) set.productFamily = patch.productFamily;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.template !== undefined) set.template = patch.template;
  const [row] = await db
    .update(equipmentCategories)
    .set(set)
    .where(and(eq(equipmentCategories.orgId, orgId), eq(equipmentCategories.id, id)))
    .returning();
  return row ? toCategoryDTO(row) : null;
}

export async function deleteCategory(orgId: string, id: string) {
  await db
    .delete(equipmentCategories)
    .where(and(eq(equipmentCategories.orgId, orgId), eq(equipmentCategories.id, id)));
}

export async function upsertTemplateSection(
  orgId: string,
  categoryId: string,
  input: { sectionKey: string; label: string; group?: string; kind?: string; ordinal: number },
) {
  const [row] = await db
    .insert(knowledgeTemplateSections)
    .values({
      orgId,
      categoryId,
      sectionKey: input.sectionKey,
      label: input.label,
      group: input.group,
      kind: input.kind ?? "content",
      ordinal: input.ordinal,
    })
    .onConflictDoUpdate({
      target: [knowledgeTemplateSections.categoryId, knowledgeTemplateSections.sectionKey],
      set: {
        label: input.label,
        group: input.group,
        kind: input.kind ?? "content",
        ordinal: input.ordinal,
      },
    })
    .returning();
  return row ?? null;
}

export async function getOrderedSections(orgId: string, categoryId: string) {
  const rows = await db
    .select()
    .from(knowledgeTemplateSections)
    .where(
      and(
        eq(knowledgeTemplateSections.orgId, orgId),
        eq(knowledgeTemplateSections.categoryId, categoryId),
      ),
    )
    .orderBy(asc(knowledgeTemplateSections.ordinal));
  return rows.map(toTemplateSectionDTO);
}

// ── Manufacturers ──────────────────────────────────────────────────────

export async function listManufacturers(orgId: string) {
  const rows = await db
    .select()
    .from(manufacturers)
    .where(eq(manufacturers.orgId, orgId))
    .orderBy(asc(manufacturers.name));
  return rows.map(toManufacturerDTO);
}

export async function createManufacturer(
  orgId: string,
  input: { name: string; country?: string; notes?: string; createdBy?: string },
) {
  const slug = slugifyName(input.name) || "untitled";
  const [row] = await db
    .insert(manufacturers)
    .values({ orgId, name: input.name, slug, country: input.country, notes: input.notes, createdById: input.createdBy })
    .onConflictDoNothing({ target: [manufacturers.orgId, manufacturers.slug] })
    .returning();
  return row ? toManufacturerDTO(row) : null;
}

export async function updateManufacturer(
  orgId: string,
  id: string,
  patch: { name?: string; country?: string | null; notes?: string | null },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    set.slug = slugifyName(patch.name) || "untitled";
  }
  if (patch.country !== undefined) set.country = patch.country;
  if (patch.notes !== undefined) set.notes = patch.notes;
  const [row] = await db
    .update(manufacturers)
    .set(set)
    .where(and(eq(manufacturers.orgId, orgId), eq(manufacturers.id, id)))
    .returning();
  return row ? toManufacturerDTO(row) : null;
}

export async function deleteManufacturer(orgId: string, id: string) {
  await db.delete(manufacturers).where(and(eq(manufacturers.orgId, orgId), eq(manufacturers.id, id)));
}

// ── Systems / Subsystems / Components ──────────────────────────────────

export async function listSystems(orgId: string, categoryId?: string) {
  const conds = [eq(equipmentSystems.orgId, orgId)];
  if (categoryId) conds.push(eq(equipmentSystems.categoryId, categoryId));
  const rows = await db
    .select()
    .from(equipmentSystems)
    .where(and(...conds))
    .orderBy(asc(equipmentSystems.ordinal));
  return rows.map(toSystemDTO);
}

export async function createSystem(
  orgId: string,
  categoryId: string,
  input: { name: string; reference?: string; description?: string; ordinal?: number; createdBy?: string },
) {
  const [row] = await db
    .insert(equipmentSystems)
    .values({
      orgId,
      categoryId,
      name: input.name,
      slug: slugifyName(input.name) || "untitled",
      reference: input.reference,
      description: input.description,
      ordinal: input.ordinal ?? 0,
      createdById: input.createdBy,
    })
    .returning();
  return toSystemDTO(row);
}

export async function updateSystem(
  orgId: string,
  id: string,
  patch: { name?: string; reference?: string | null; description?: string | null; ordinal?: number },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    set.slug = slugifyName(patch.name) || "untitled";
  }
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.ordinal !== undefined) set.ordinal = patch.ordinal;
  const [row] = await db
    .update(equipmentSystems)
    .set(set)
    .where(and(eq(equipmentSystems.orgId, orgId), eq(equipmentSystems.id, id)))
    .returning();
  return row ? toSystemDTO(row) : null;
}

export async function deleteSystem(orgId: string, id: string) {
  await db.delete(equipmentSystems).where(and(eq(equipmentSystems.orgId, orgId), eq(equipmentSystems.id, id)));
}

export async function listSubsystems(orgId: string, systemId?: string) {
  const conds = [eq(equipmentSubsystems.orgId, orgId)];
  if (systemId) conds.push(eq(equipmentSubsystems.systemId, systemId));
  const rows = await db
    .select()
    .from(equipmentSubsystems)
    .where(and(...conds))
    .orderBy(asc(equipmentSubsystems.ordinal));
  return rows.map(toSubsystemDTO);
}

export async function createSubsystem(
  orgId: string,
  systemId: string,
  input: { name: string; reference?: string; description?: string; ordinal?: number; createdBy?: string },
) {
  const [row] = await db
    .insert(equipmentSubsystems)
    .values({
      orgId,
      systemId,
      name: input.name,
      slug: slugifyName(input.name) || "untitled",
      reference: input.reference,
      description: input.description,
      ordinal: input.ordinal ?? 0,
      createdById: input.createdBy,
    })
    .returning();
  return toSubsystemDTO(row);
}

export async function updateSubsystem(
  orgId: string,
  id: string,
  patch: { name?: string; reference?: string | null; description?: string | null; ordinal?: number },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    set.slug = slugifyName(patch.name) || "untitled";
  }
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.ordinal !== undefined) set.ordinal = patch.ordinal;
  const [row] = await db
    .update(equipmentSubsystems)
    .set(set)
    .where(and(eq(equipmentSubsystems.orgId, orgId), eq(equipmentSubsystems.id, id)))
    .returning();
  return row ? toSubsystemDTO(row) : null;
}

export async function deleteSubsystem(orgId: string, id: string) {
  await db
    .delete(equipmentSubsystems)
    .where(and(eq(equipmentSubsystems.orgId, orgId), eq(equipmentSubsystems.id, id)));
}

export async function listComponents(orgId: string, subsystemId?: string) {
  const conds = [eq(equipmentComponents.orgId, orgId)];
  if (subsystemId) conds.push(eq(equipmentComponents.subsystemId, subsystemId));
  const rows = await db
    .select()
    .from(equipmentComponents)
    .where(and(...conds))
    .orderBy(asc(equipmentComponents.ordinal));
  return rows.map(toComponentDTO);
}

export async function createComponent(
  orgId: string,
  subsystemId: string,
  input: {
    name: string;
    kind?: string;
    reference?: string;
    manufacturerPartNumber?: string;
    description?: string;
    ordinal?: number;
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(equipmentComponents)
    .values({
      orgId,
      subsystemId,
      name: input.name,
      slug: slugifyName(input.name) || "untitled",
      kind: (input.kind ?? "generic") as typeof equipmentComponents.$inferSelect.kind,
      reference: input.reference,
      manufacturerPartNumber: input.manufacturerPartNumber,
      description: input.description,
      ordinal: input.ordinal ?? 0,
      createdById: input.createdBy,
    })
    .returning();
  return toComponentDTO(row);
}

export async function updateComponent(
  orgId: string,
  id: string,
  patch: Partial<{
    name: string;
    kind: string;
    reference: string | null;
    manufacturerPartNumber: string | null;
    description: string | null;
    ordinal: number;
  }>,
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    set.slug = slugifyName(patch.name) || "untitled";
  }
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.reference !== undefined) set.reference = patch.reference;
  if (patch.manufacturerPartNumber !== undefined) set.manufacturerPartNumber = patch.manufacturerPartNumber;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.ordinal !== undefined) set.ordinal = patch.ordinal;
  const [row] = await db
    .update(equipmentComponents)
    .set(set)
    .where(and(eq(equipmentComponents.orgId, orgId), eq(equipmentComponents.id, id)))
    .returning();
  return row ? toComponentDTO(row) : null;
}

export async function deleteComponent(orgId: string, id: string) {
  await db
    .delete(equipmentComponents)
    .where(and(eq(equipmentComponents.orgId, orgId), eq(equipmentComponents.id, id)));
}

// ── Connectors / Terminals / Measurement points ────────────────────────

export async function listConnectors(orgId: string, componentId?: string) {
  const conds = [eq(equipmentConnectors.orgId, orgId)];
  if (componentId) conds.push(eq(equipmentConnectors.componentId, componentId));
  const rows = await db
    .select()
    .from(equipmentConnectors)
    .where(and(...conds))
    .orderBy(asc(equipmentConnectors.ordinal));
  return rows.map(toConnectorDTO);
}

export async function createConnector(
  orgId: string,
  componentId: string,
  input: { label: string; board?: string; description?: string; ordinal?: number; createdBy?: string },
) {
  const [row] = await db
    .insert(equipmentConnectors)
    .values({
      orgId,
      componentId,
      label: input.label,
      board: input.board,
      description: input.description,
      ordinal: input.ordinal ?? 0,
      createdById: input.createdBy,
    })
    .returning();
  return toConnectorDTO(row);
}

export async function deleteConnector(orgId: string, id: string) {
  await db
    .delete(equipmentConnectors)
    .where(and(eq(equipmentConnectors.orgId, orgId), eq(equipmentConnectors.id, id)));
}

export async function listTerminals(orgId: string, connectorId?: string) {
  const conds = [eq(equipmentTerminals.orgId, orgId)];
  if (connectorId) conds.push(eq(equipmentTerminals.connectorId, connectorId));
  const rows = await db
    .select()
    .from(equipmentTerminals)
    .where(and(...conds))
    .orderBy(asc(equipmentTerminals.pin));
  return rows.map(toTerminalDTO);
}

export async function createTerminal(
  orgId: string,
  connectorId: string,
  input: { pin: number; signal?: string; wireColor?: string; description?: string; ordinal?: number },
) {
  const [row] = await db
    .insert(equipmentTerminals)
    .values({
      orgId,
      connectorId,
      pin: input.pin,
      signal: input.signal,
      wireColor: input.wireColor,
      description: input.description,
      ordinal: input.ordinal ?? 0,
    })
    .returning();
  return toTerminalDTO(row);
}

export async function deleteTerminal(orgId: string, id: string) {
  await db
    .delete(equipmentTerminals)
    .where(and(eq(equipmentTerminals.orgId, orgId), eq(equipmentTerminals.id, id)));
}

export async function listMeasurementPoints(orgId: string, componentId?: string, connectorId?: string) {
  const conds = [eq(measurementPoints.orgId, orgId)];
  if (componentId) conds.push(eq(measurementPoints.componentId, componentId));
  if (connectorId) conds.push(eq(measurementPoints.connectorId, connectorId));
  const rows = await db
    .select()
    .from(measurementPoints)
    .where(and(...conds))
    .orderBy(asc(measurementPoints.name));
  return rows.map(toMeasurementPointDTO);
}

export async function createMeasurementPoint(
  orgId: string,
  input: {
    componentId?: string;
    connectorId?: string;
    name: string;
    parameter: string;
    unit?: string;
    expectedMin?: number;
    expectedMax?: number;
    expectedExact?: number;
    measurementConditions?: string;
    instrumentRequired?: string;
    safetyNotes?: string;
    reference?: string;
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(measurementPoints)
    .values({
      orgId,
      componentId: input.componentId,
      connectorId: input.connectorId,
      name: input.name,
      parameter: input.parameter,
      unit: input.unit,
      expectedMin: input.expectedMin,
      expectedMax: input.expectedMax,
      expectedExact: input.expectedExact,
      measurementConditions: input.measurementConditions,
      instrumentRequired: input.instrumentRequired,
      safetyNotes: input.safetyNotes,
      reference: input.reference,
      createdById: input.createdBy,
    })
    .returning();
  return toMeasurementPointDTO(row);
}

export async function updateMeasurementPoint(
  orgId: string,
  id: string,
  patch: Partial<Record<string, unknown>>,
) {
  const [row] = await db
    .update(measurementPoints)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(measurementPoints.orgId, orgId), eq(measurementPoints.id, id)))
    .returning();
  return row ? toMeasurementPointDTO(row) : null;
}

export async function deleteMeasurementPoint(orgId: string, id: string) {
  await db.delete(measurementPoints).where(and(eq(measurementPoints.orgId, orgId), eq(measurementPoints.id, id)));
}

// ── Error codes ────────────────────────────────────────────────────────

export async function listErrorCodes(orgId: string, equipmentModelId?: string) {
  const conds = [eq(equipmentErrorCodes.orgId, orgId)];
  if (equipmentModelId) conds.push(eq(equipmentErrorCodes.equipmentModelId, equipmentModelId));
  const rows = await db
    .select()
    .from(equipmentErrorCodes)
    .where(and(...conds))
    .orderBy(asc(equipmentErrorCodes.code));
  return rows.map(toErrorCodeDTO);
}

export async function createErrorCode(
  orgId: string,
  input: {
    equipmentModelId: string;
    systemId?: string;
    code: string;
    meaning?: string;
    description?: string;
    preconditions?: string[];
    likelyCauses?: string[];
    correctiveActions?: string[];
    severity?: string;
    tags?: string[];
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(equipmentErrorCodes)
    .values({
      orgId,
      equipmentModelId: input.equipmentModelId,
      systemId: input.systemId,
      code: input.code,
      normalizedCode: slugifyName(input.code) || input.code.toLowerCase(),
      meaning: input.meaning,
      description: input.description,
      preconditions: input.preconditions ?? [],
      likelyCauses: input.likelyCauses ?? [],
      correctiveActions: input.correctiveActions ?? [],
      severity: input.severity,
      tags: input.tags ?? [],
      createdById: input.createdBy,
    })
    .onConflictDoNothing({
      target: [equipmentErrorCodes.orgId, equipmentErrorCodes.equipmentModelId, equipmentErrorCodes.normalizedCode],
    })
    .returning();
  return row ? toErrorCodeDTO(row) : null;
}

export async function getErrorCode(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(equipmentErrorCodes)
    .where(and(eq(equipmentErrorCodes.orgId, orgId), eq(equipmentErrorCodes.id, id)));
  return row ? toErrorCodeDTO(row) : null;
}

export async function updateErrorCode(orgId: string, id: string, patch: Partial<Record<string, unknown>>) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.code !== undefined) {
    set.code = patch.code;
    set.normalizedCode = slugifyName(String(patch.code)) || String(patch.code).toLowerCase();
  }
  for (const key of [
    "systemId",
    "meaning",
    "description",
    "preconditions",
    "likelyCauses",
    "correctiveActions",
    "severity",
    "tags",
  ]) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  const [row] = await db
    .update(equipmentErrorCodes)
    .set(set)
    .where(and(eq(equipmentErrorCodes.orgId, orgId), eq(equipmentErrorCodes.id, id)))
    .returning();
  return row ? toErrorCodeDTO(row) : null;
}

export async function deleteErrorCode(orgId: string, id: string) {
  await db
    .delete(equipmentErrorCodes)
    .where(and(eq(equipmentErrorCodes.orgId, orgId), eq(equipmentErrorCodes.id, id)));
}

// ── Operating sequences ────────────────────────────────────────────────

export async function listSequences(orgId: string, equipmentModelId?: string) {
  const conds = [eq(operatingSequences.orgId, orgId)];
  if (equipmentModelId) conds.push(eq(operatingSequences.equipmentModelId, equipmentModelId));
  const rows = await db
    .select()
    .from(operatingSequences)
    .where(and(...conds))
    .orderBy(asc(operatingSequences.ordinal));
  return rows.map(toSequenceDTO);
}

export async function createSequence(
  orgId: string,
  input: {
    equipmentModelId: string;
    systemId?: string;
    name: string;
    phase?: string;
    description?: string;
    steps?: Array<{ sequence: number; label: string; detail?: string; duration?: string }>;
    ordinal?: number;
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(operatingSequences)
    .values({
      orgId,
      equipmentModelId: input.equipmentModelId,
      systemId: input.systemId,
      name: input.name,
      phase: input.phase,
      description: input.description,
      steps: input.steps ?? [],
      ordinal: input.ordinal ?? 0,
      createdById: input.createdBy,
    })
    .returning();
  return toSequenceDTO(row);
}

export async function updateSequence(
  orgId: string,
  id: string,
  patch: Partial<Record<string, unknown>>,
) {
  const [row] = await db
    .update(operatingSequences)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(operatingSequences.orgId, orgId), eq(operatingSequences.id, id)))
    .returning();
  return row ? toSequenceDTO(row) : null;
}

export async function deleteSequence(orgId: string, id: string) {
  await db
    .delete(operatingSequences)
    .where(and(eq(operatingSequences.orgId, orgId), eq(operatingSequences.id, id)));
}

// ── Service modes ──────────────────────────────────────────────────────

export async function listServiceModes(orgId: string, equipmentModelId?: string) {
  const conds = [eq(serviceModes.orgId, orgId)];
  if (equipmentModelId) conds.push(eq(serviceModes.equipmentModelId, equipmentModelId));
  const rows = await db
    .select()
    .from(serviceModes)
    .where(and(...conds))
    .orderBy(asc(serviceModes.name));
  return rows.map(toServiceModeDTO);
}

export async function createServiceMode(
  orgId: string,
  input: {
    equipmentModelId: string;
    name: string;
    entryProcedure?: string;
    parameters?: Array<{ code: string; label: string; description?: string }>;
    description?: string;
    safetyWarnings?: SafetyWarning[];
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(serviceModes)
    .values({
      orgId,
      equipmentModelId: input.equipmentModelId,
      name: input.name,
      entryProcedure: input.entryProcedure,
      parameters: input.parameters ?? [],
      description: input.description,
      safetyWarnings: input.safetyWarnings ?? [],
      createdById: input.createdBy,
    })
    .onConflictDoNothing({
      target: [serviceModes.orgId, serviceModes.equipmentModelId, serviceModes.name],
    })
    .returning();
  return row ? toServiceModeDTO(row) : null;
}

export async function updateServiceMode(orgId: string, id: string, patch: Partial<Record<string, unknown>>) {
  const [row] = await db
    .update(serviceModes)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(serviceModes.orgId, orgId), eq(serviceModes.id, id)))
    .returning();
  return row ? toServiceModeDTO(row) : null;
}

export async function deleteServiceMode(orgId: string, id: string) {
  await db.delete(serviceModes).where(and(eq(serviceModes.orgId, orgId), eq(serviceModes.id, id)));
}

// ── Knowledge articles ─────────────────────────────────────────────────

export async function listArticles(orgId: string, equipmentModelId?: string, categoryId?: string) {
  const conds = [eq(knowledgeArticles.orgId, orgId)];
  if (equipmentModelId) conds.push(eq(knowledgeArticles.equipmentModelId, equipmentModelId));
  if (categoryId) conds.push(eq(knowledgeArticles.categoryId, categoryId));
  const rows = await db
    .select()
    .from(knowledgeArticles)
    .where(and(...conds))
    .orderBy(desc(knowledgeArticles.createdAt));
  return rows.map(toArticleDTO);
}

export async function createArticle(
  orgId: string,
  input: {
    equipmentModelId?: string;
    categoryId?: string;
    title: string;
    kind?: string;
    body: string;
    summary?: string;
    tags?: string[];
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(knowledgeArticles)
    .values({
      orgId,
      equipmentModelId: input.equipmentModelId,
      categoryId: input.categoryId,
      title: input.title,
      slug: slugifyName(input.title) || "untitled-article",
      kind: input.kind ?? "article",
      body: input.body,
      summary: input.summary,
      tags: input.tags ?? [],
      createdById: input.createdBy,
    })
    .returning();
  return toArticleDTO(row);
}

export async function getArticle(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(knowledgeArticles)
    .where(and(eq(knowledgeArticles.orgId, orgId), eq(knowledgeArticles.id, id)));
  return row ? toArticleDTO(row) : null;
}

export async function updateArticle(orgId: string, id: string, patch: Partial<Record<string, unknown>>) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    set.title = patch.title;
    set.slug = slugifyName(String(patch.title)) || "untitled-article";
  }
  for (const key of ["equipmentModelId", "categoryId", "kind", "body", "summary", "tags"]) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  const [row] = await db
    .update(knowledgeArticles)
    .set(set)
    .where(and(eq(knowledgeArticles.orgId, orgId), eq(knowledgeArticles.id, id)))
    .returning();
  return row ? toArticleDTO(row) : null;
}

export async function deleteArticle(orgId: string, id: string) {
  await db.delete(knowledgeArticles).where(and(eq(knowledgeArticles.orgId, orgId), eq(knowledgeArticles.id, id)));
}

// ── Knowledge edges (generic graph) ────────────────────────────────────

export async function listEdges(orgId: string, sourceType?: string, sourceId?: string) {
  const conds = [eq(knowledgeEdges.orgId, orgId)];
  if (sourceType) conds.push(eq(knowledgeEdges.sourceType, sourceType));
  if (sourceId) conds.push(eq(knowledgeEdges.sourceId, sourceId));
  const rows = await db
    .select()
    .from(knowledgeEdges)
    .where(and(...conds))
    .orderBy(desc(knowledgeEdges.createdAt));
  return rows.map(toEdgeDTO);
}

export async function createEdge(
  orgId: string,
  input: {
    sourceType: string;
    sourceId: string;
    relationship: string;
    targetType: string;
    targetId: string;
    meta?: Record<string, unknown>;
    createdBy?: string;
  },
) {
  const [row] = await db
    .insert(knowledgeEdges)
    .values({
      orgId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      relationship: input.relationship,
      targetType: input.targetType,
      targetId: input.targetId,
      meta: input.meta ?? {},
      createdById: input.createdBy,
    })
    .onConflictDoNothing({
      target: [
        knowledgeEdges.sourceType,
        knowledgeEdges.sourceId,
        knowledgeEdges.relationship,
        knowledgeEdges.targetType,
        knowledgeEdges.targetId,
      ],
    })
    .returning();
  return row ? toEdgeDTO(row) : null;
}

export async function deleteEdge(orgId: string, id: string) {
  await db.delete(knowledgeEdges).where(and(eq(knowledgeEdges.orgId, orgId), eq(knowledgeEdges.id, id)));
}

// ── Taxonomy tree (Model Workspace) ────────────────────────────────────

export async function getTaxonomyTree(orgId: string, categoryId: string): Promise<EquipmentTaxonomyDTO> {
  const [categoryRow] = await db
    .select()
    .from(equipmentCategories)
    .where(and(eq(equipmentCategories.orgId, orgId), eq(equipmentCategories.id, categoryId)));

  const sections = await getOrderedSections(orgId, categoryId);
  const configuredTemplate = categoryRow?.template as EquipmentCategoryTemplate | undefined;
  const templateSections: KnowledgeTemplateSection[] =
    configuredTemplate && configuredTemplate.sections.length > 0
      ? configuredTemplate.sections
      : sections.map((s) => ({
          key: s.sectionKey,
          label: s.label,
          group: s.group ?? undefined,
          kind: s.kind,
          ordinal: s.ordinal,
        }));

  const systems = await db
    .select()
    .from(equipmentSystems)
    .where(and(eq(equipmentSystems.orgId, orgId), eq(equipmentSystems.categoryId, categoryId)))
    .orderBy(asc(equipmentSystems.ordinal));

  const subsystemRows = await db
    .select()
    .from(equipmentSubsystems)
    .where(eq(equipmentSubsystems.orgId, orgId))
    .orderBy(asc(equipmentSubsystems.ordinal));
  const componentRows = await db
    .select()
    .from(equipmentComponents)
    .where(eq(equipmentComponents.orgId, orgId))
    .orderBy(asc(equipmentComponents.ordinal));

  const subsystemsBySystem = new Map<string, (typeof subsystemRows)[number][]>();
  for (const s of subsystemRows) {
    const arr = subsystemsBySystem.get(s.systemId) ?? [];
    arr.push(s);
    subsystemsBySystem.set(s.systemId, arr);
  }
  const componentsBySubsystem = new Map<string, (typeof componentRows)[number][]>();
  for (const c of componentRows) {
    const arr = componentsBySubsystem.get(c.subsystemId) ?? [];
    arr.push(c);
    componentsBySubsystem.set(c.subsystemId, arr);
  }

  return {
    category: categoryRow ? toCategoryDTO(categoryRow) : null,
    template: templateSections,
    systems: systems.map((sys) => ({
      ...toSystemDTO(sys),
      subsystems: (subsystemsBySystem.get(sys.id) ?? []).map((sub) => ({
        ...toSubsystemDTO(sub),
        components: (componentsBySubsystem.get(sub.id) ?? []).map(toComponentDTO),
      })),
    })),
  };
}

// ── Model intelligence helpers ─────────────────────────────────────────

export async function listSystemOptions(orgId: string, q?: string) {
  const conds = [eq(equipmentSystems.orgId, orgId)];
  if (q) conds.push(ilike(equipmentSystems.name, `%${q}%`));
  const rows = await db
    .select()
    .from(equipmentSystems)
    .where(and(...conds))
    .orderBy(asc(equipmentSystems.name))
    .limit(50);
  return rows.map(toSystemDTO);
}

export async function linkModelCategory(orgId: string, modelId: string, categoryId: string) {
  const [row] = await db
    .update(equipmentModels)
    .set({ categoryId, updatedAt: new Date() })
    .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, modelId)))
    .returning();
  return row ?? null;
}

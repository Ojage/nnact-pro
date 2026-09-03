import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SAFETY_WARNING } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import type { JwtClaims } from "../auth.js";
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  upsertTemplateSection,
  getOrderedSections,
  listManufacturers,
  createManufacturer,
  updateManufacturer,
  deleteManufacturer,
  listSystems,
  createSystem,
  updateSystem,
  deleteSystem,
  listSubsystems,
  createSubsystem,
  updateSubsystem,
  deleteSubsystem,
  listComponents,
  createComponent,
  updateComponent,
  deleteComponent,
  listConnectors,
  createConnector,
  deleteConnector,
  listTerminals,
  createTerminal,
  deleteTerminal,
  listMeasurementPoints,
  createMeasurementPoint,
  updateMeasurementPoint,
  deleteMeasurementPoint,
  listErrorCodes,
  createErrorCode,
  getErrorCode,
  updateErrorCode,
  deleteErrorCode,
  listSequences,
  createSequence,
  updateSequence,
  deleteSequence,
  listServiceModes,
  createServiceMode,
  updateServiceMode,
  deleteServiceMode,
  listArticles,
  createArticle,
  getArticle,
  updateArticle,
  deleteArticle,
  listEdges,
  createEdge,
  deleteEdge,
  getTaxonomyTree,
  listSystemOptions,
  linkModelCategory,
} from "../repair-brain-intelligence.js";

const templateSectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  group: z.string().optional(),
  kind: z.string().default("content"),
  ordinal: z.number(),
});
const categorySchema = z.object({
  name: z.string().min(1),
  subcategory: z.string().optional(),
  productFamily: z.string().optional(),
  description: z.string().optional(),
  template: z
    .object({ sections: z.array(templateSectionSchema) })
    .optional(),
});
const manufacturerSchema = z.object({
  name: z.string().min(1),
  country: z.string().optional(),
  notes: z.string().optional(),
});
const systemSchema = z.object({
  name: z.string().min(1),
  reference: z.string().optional(),
  description: z.string().optional(),
  ordinal: z.number().optional(),
});
const subsystemSchema = z.object({
  name: z.string().min(1),
  reference: z.string().optional(),
  description: z.string().optional(),
  ordinal: z.number().optional(),
});
const componentSchema = z.object({
  name: z.string().min(1),
  kind: z.string().optional(),
  reference: z.string().optional(),
  manufacturerPartNumber: z.string().optional(),
  description: z.string().optional(),
  ordinal: z.number().optional(),
});
const connectorSchema = z.object({
  label: z.string().min(1),
  board: z.string().optional(),
  description: z.string().optional(),
  ordinal: z.number().optional(),
});
const terminalSchema = z.object({
  pin: z.number().int(),
  signal: z.string().optional(),
  wireColor: z.string().optional(),
  description: z.string().optional(),
  ordinal: z.number().optional(),
});
const measurementPointSchema = z.object({
  componentId: z.string().optional(),
  connectorId: z.string().optional(),
  name: z.string().min(1),
  parameter: z.string().min(1),
  unit: z.string().optional(),
  expectedMin: z.number().optional(),
  expectedMax: z.number().optional(),
  expectedExact: z.number().optional(),
  measurementConditions: z.string().optional(),
  instrumentRequired: z.string().optional(),
  safetyNotes: z.string().optional(),
  reference: z.string().optional(),
});
const errorCodeSchema = z.object({
  equipmentModelId: z.string().min(1),
  systemId: z.string().optional(),
  code: z.string().min(1),
  meaning: z.string().optional(),
  description: z.string().optional(),
  preconditions: z.array(z.string()).optional(),
  likelyCauses: z.array(z.string()).optional(),
  correctiveActions: z.array(z.string()).optional(),
  severity: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
const sequenceSchema = z.object({
  equipmentModelId: z.string().min(1),
  systemId: z.string().optional(),
  name: z.string().min(1),
  phase: z.string().optional(),
  description: z.string().optional(),
  steps: z
    .array(z.object({ sequence: z.number(), label: z.string(), detail: z.string().optional(), duration: z.string().optional() }))
    .optional(),
  ordinal: z.number().optional(),
});
const serviceModeSchema = z.object({
  equipmentModelId: z.string().min(1),
  name: z.string().min(1),
  entryProcedure: z.string().optional(),
  parameters: z.array(z.object({ code: z.string(), label: z.string(), description: z.string().optional() })).optional(),
  description: z.string().optional(),
  safetyWarnings: z.array(z.enum(SAFETY_WARNING)).optional(),
});
const articleSchema = z.object({
  equipmentModelId: z.string().optional(),
  categoryId: z.string().optional(),
  title: z.string().min(1),
  kind: z.string().optional(),
  body: z.string().min(1),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
const edgeSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  relationship: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
});

async function resolveUserId(req: Parameters<typeof resolveOrgId>[0]): Promise<string | undefined> {
  try {
    await req.jwtVerify();
    const claims = req.user as JwtClaims;
    return claims?.userId;
  } catch {
    return undefined;
  }
}

export async function repairBrainIntelligenceRoutes(app: FastifyInstance) {
  app.get("/categories", async (req) => {
    const orgId = await resolveOrgId(req);
    return { categories: await listCategories(orgId) };
  });

  app.get("/categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const row = await getCategory(orgId, (req.params as { id: string }).id);
    if (!row) return reply.code(404).send({ error: "category not found" });
    return toCategoryResponse(row, orgId);
  });

  app.post("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const created = await createCategory(orgId, { ...parsed.data, createdBy: userId });
    if (!created) return reply.code(409).send({ error: "category slug already exists" });
    return reply.code(201).send(created);
  });

  app.patch("/categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = categorySchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateCategory(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "category not found" });
    return updated;
  });

  app.delete("/categories/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteCategory(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/categories/:id/template", async (req) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const sections = await getOrderedSections(orgId, id);
    return { sections };
  });

  app.put("/categories/:id/template/sections", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = z
      .array(z.object({ sectionKey: z.string().min(1), label: z.string().min(1), group: z.string().optional(), kind: z.string().optional(), ordinal: z.number() }))
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const sections = [];
    for (const s of parsed.data) {
      sections.push(await upsertTemplateSection(orgId, id, s));
    }
    return { sections };
  });

  app.get("/manufacturers", async (req) => {
    const orgId = await resolveOrgId(req);
    return { manufacturers: await listManufacturers(orgId) };
  });

  app.post("/manufacturers", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = manufacturerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const created = await createManufacturer(orgId, { ...parsed.data, createdBy: userId });
    if (!created) return reply.code(409).send({ error: "manufacturer slug already exists" });
    return reply.code(201).send(created);
  });

  app.patch("/manufacturers/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = manufacturerSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateManufacturer(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "manufacturer not found" });
    return updated;
  });

  app.delete("/manufacturers/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteManufacturer(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/systems", async (req) => {
    const orgId = await resolveOrgId(req);
    const { categoryId } = req.query as { categoryId?: string };
    return { systems: await listSystems(orgId, categoryId) };
  });

  app.post("/systems", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { categoryId } = req.query as { categoryId?: string };
    if (!categoryId) return reply.code(400).send({ error: "categoryId query param required" });
    const parsed = systemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createSystem(orgId, categoryId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/systems/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = systemSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateSystem(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "system not found" });
    return updated;
  });

  app.delete("/systems/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteSystem(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/subsystems", async (req) => {
    const orgId = await resolveOrgId(req);
    const { systemId } = req.query as { systemId?: string };
    return { subsystems: await listSubsystems(orgId, systemId) };
  });

  app.post("/subsystems", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { systemId } = req.query as { systemId?: string };
    if (!systemId) return reply.code(400).send({ error: "systemId query param required" });
    const parsed = subsystemSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createSubsystem(orgId, systemId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/subsystems/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = subsystemSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateSubsystem(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "subsystem not found" });
    return updated;
  });

  app.delete("/subsystems/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteSubsystem(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/components", async (req) => {
    const orgId = await resolveOrgId(req);
    const { subsystemId } = req.query as { subsystemId?: string };
    return { components: await listComponents(orgId, subsystemId) };
  });

  app.post("/components", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { subsystemId } = req.query as { subsystemId?: string };
    if (!subsystemId) return reply.code(400).send({ error: "subsystemId query param required" });
    const parsed = componentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createComponent(orgId, subsystemId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/components/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = componentSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateComponent(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "component not found" });
    return updated;
  });

  app.delete("/components/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteComponent(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/components/:id/connectors", async (req) => {
    const orgId = await resolveOrgId(req);
    return { connectors: await listConnectors(orgId, (req.params as { id: string }).id) };
  });

  app.post("/connectors", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { componentId } = req.query as { componentId?: string };
    if (!componentId) return reply.code(400).send({ error: "componentId query param required" });
    const parsed = connectorSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createConnector(orgId, componentId, { ...parsed.data, createdBy: userId }));
  });

  app.delete("/connectors/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteConnector(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/connectors/:id/terminals", async (req) => {
    const orgId = await resolveOrgId(req);
    return { terminals: await listTerminals(orgId, (req.params as { id: string }).id) };
  });

  app.post("/terminals", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { connectorId } = req.query as { connectorId?: string };
    if (!connectorId) return reply.code(400).send({ error: "connectorId query param required" });
    const parsed = terminalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return reply.code(201).send(await createTerminal(orgId, connectorId, parsed.data));
  });

  app.delete("/terminals/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteTerminal(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/measurement-points", async (req) => {
    const orgId = await resolveOrgId(req);
    const { componentId, connectorId } = req.query as { componentId?: string; connectorId?: string };
    return { measurementPoints: await listMeasurementPoints(orgId, componentId, connectorId) };
  });

  app.post("/measurement-points", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = measurementPointSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createMeasurementPoint(orgId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/measurement-points/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = measurementPointSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateMeasurementPoint(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "measurement point not found" });
    return updated;
  });

  app.delete("/measurement-points/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteMeasurementPoint(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/errors", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    return { errorCodes: await listErrorCodes(orgId, equipmentModelId) };
  });

  app.get("/errors/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const code = await getErrorCode(orgId, (req.params as { id: string }).id);
    if (!code) return reply.code(404).send({ error: "error code not found" });
    return code;
  });

  app.post("/errors", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = errorCodeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const created = await createErrorCode(orgId, { ...parsed.data, createdBy: userId });
    if (!created) return reply.code(409).send({ error: "error code already exists for model" });
    return reply.code(201).send(created);
  });

  app.patch("/errors/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = errorCodeSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateErrorCode(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "error code not found" });
    return updated;
  });

  app.delete("/errors/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteErrorCode(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/sequences", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    return { sequences: await listSequences(orgId, equipmentModelId) };
  });

  app.post("/sequences", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = sequenceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createSequence(orgId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/sequences/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = sequenceSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateSequence(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "sequence not found" });
    return updated;
  });

  app.delete("/sequences/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteSequence(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/service-modes", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    return { serviceModes: await listServiceModes(orgId, equipmentModelId) };
  });

  app.post("/service-modes", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = serviceModeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const created = await createServiceMode(orgId, { ...parsed.data, createdBy: userId });
    if (!created) return reply.code(409).send({ error: "service mode already exists for model" });
    return reply.code(201).send(created);
  });

  app.patch("/service-modes/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = serviceModeSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateServiceMode(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "service mode not found" });
    return updated;
  });

  app.delete("/service-modes/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteServiceMode(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/articles", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId, categoryId } = req.query as { equipmentModelId?: string; categoryId?: string };
    return { articles: await listArticles(orgId, equipmentModelId, categoryId) };
  });

  app.get("/articles/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const article = await getArticle(orgId, (req.params as { id: string }).id);
    if (!article) return reply.code(404).send({ error: "article not found" });
    return article;
  });

  app.post("/articles", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = articleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    return reply.code(201).send(await createArticle(orgId, { ...parsed.data, createdBy: userId }));
  });

  app.patch("/articles/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = articleSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await updateArticle(orgId, (req.params as { id: string }).id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "article not found" });
    return updated;
  });

  app.delete("/articles/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteArticle(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/edges", async (req) => {
    const orgId = await resolveOrgId(req);
    const { sourceType, sourceId } = req.query as { sourceType?: string; sourceId?: string };
    return { edges: await listEdges(orgId, sourceType, sourceId) };
  });

  app.post("/edges", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = edgeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const created = await createEdge(orgId, { ...parsed.data, createdBy: userId });
    if (!created) return reply.code(409).send({ error: "edge already exists" });
    return reply.code(201).send(created);
  });

  app.delete("/edges/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await deleteEdge(orgId, (req.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/taxonomy/:categoryId", async (req) => {
    const orgId = await resolveOrgId(req);
    return getTaxonomyTree(orgId, (req.params as { categoryId: string }).categoryId);
  });

  app.get("/system-options", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q } = req.query as { q?: string };
    return { systems: await listSystemOptions(orgId, q) };
  });

  app.post("/models/:modelId/link-category", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { modelId } = req.params as { modelId: string };
    const parsed = z.object({ categoryId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await linkModelCategory(orgId, modelId, parsed.data.categoryId);
    if (!row) return reply.code(404).send({ error: "model not found" });
    return row;
  });
}

async function toCategoryResponse(row: NonNullable<Awaited<ReturnType<typeof getCategory>>>, orgId: string) {
  const sections = await getOrderedSections(orgId, row.id);
  const template = {
    sections:
      (row.template && Array.isArray(row.template.sections) && row.template.sections.length > 0
        ? row.template.sections
        : sections) ?? sections,
  };
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    subcategory: row.subcategory,
    productFamily: row.productFamily,
    description: row.description,
    template,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

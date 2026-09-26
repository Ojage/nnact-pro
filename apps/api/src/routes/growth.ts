// Growth & Outreach — Stage 1 routes: prospects, sender identities, suppression.
//
// Every handler scopes by org and re-checks the role in-handler, because the
// global prefix guard in operational-authorization.ts only covers writes while
// this module also restricts reads (see growth/access.ts).
//
// Two invariants are enforced here rather than in the UI:
//   • A sender identity cannot become cold-approved without a VERIFIED inbox and
//     a recorded owner approval.
//   • Creating a prospect that duplicates an existing one on a shared identifier
//     (email, domain, phone) is refused unless the caller explicitly forces it.

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  db,
  growthContactDetails,
  growthProspects,
  growthSenderIdentities,
  growthSuppressions,
} from "@nnact/db";
import {
  GROWTH_CONTACT_DETAIL_KIND,
  GROWTH_PROSPECT_LIFECYCLE,
  GROWTH_PROSPECT_SOURCE,
  GROWTH_SUPPRESSION_REASON,
  GROWTH_SUPPRESSION_SCOPE,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import {
  canManageSenderIdentities,
  requireGrowthRead,
  requireGrowthWrite,
} from "../growth/access.js";
import { detectDuplicates, hasHardDuplicate } from "../growth/duplicates.js";
import { loadDuplicateCandidates } from "../growth/prospect-duplicates.js";
import {
  normalizeCompany,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "../growth/send-policy.js";

const uuid = z.string().uuid();
const trimmed = z.string().trim().min(1);
const optionalText = z.string().trim().max(4000).nullish();

const contactInput = z.object({
  kind: z.enum(GROWTH_CONTACT_DETAIL_KIND),
  value: trimmed.max(320),
  label: z.string().trim().max(120).nullish(),
  isPrimary: z.boolean().optional(),
  source: z.string().trim().max(240).nullish(),
  sourceUrl: z.string().trim().max(500).nullish(),
  sourceDate: z.string().datetime().nullish(),
});

const createProspectBody = z.object({
  companyName: trimmed.max(240),
  websiteDomain: z.string().trim().max(240).nullish(),
  industry: z.string().trim().max(160).nullish(),
  city: z.string().trim().max(120).nullish(),
  region: z.string().trim().max(120).nullish(),
  country: z.string().trim().max(120).nullish(),
  equipmentNeeds: z.string().trim().max(4000).nullish(),
  lifecycle: z.enum(GROWTH_PROSPECT_LIFECYCLE).optional(),
  source: z.enum(GROWTH_PROSPECT_SOURCE).optional(),
  sourceDetail: z.string().trim().max(500).nullish(),
  notes: optionalText,
  assignedTo: uuid.nullish(),
  /** Set when a human confirms the research is real. */
  verified: z.boolean().optional(),
  contacts: z.array(contactInput).max(20).optional(),
  /**
   * Country calling code (e.g. "27") used to expand national phone numbers into
   * the stored comparison form. Supplied by the caller because a trunk-prefix
   * swap is country-specific and cannot be inferred reliably from the org.
   */
  countryCallingCode: z.string().trim().regex(/^\d{1,4}$/).nullish(),
  /** Proceed despite a duplicate on a shared identifier. */
  force: z.boolean().optional(),
});

const updateProspectBody = createProspectBody.omit({ force: true, countryCallingCode: true }).partial();

const listProspectsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  lifecycle: z.enum(GROWTH_PROSPECT_LIFECYCLE).optional(),
  source: z.enum(GROWTH_PROSPECT_SOURCE).optional(),
  assignedTo: uuid.optional(),
  city: z.string().trim().max(120).optional(),
  includeMerged: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const addContactBody = contactInput.extend({
  /** Country calling code used to expand a national number into comparison form. */
  countryCallingCode: z.string().trim().regex(/^\d{1,4}$/).nullish(),
});

const mergeBody = z.object({ intoId: uuid });

const createSenderBody = z.object({
  displayName: trimmed.max(160),
  email: z.string().trim().email().max(320),
  replyToEmail: z.string().trim().email().max(320).nullish(),
  roleTitle: z.string().trim().max(160).nullish(),
});

const updateSenderBody = z.object({
  displayName: trimmed.max(160).optional(),
  replyToEmail: z.string().trim().email().max(320).nullish(),
  roleTitle: z.string().trim().max(160).nullish(),
  isActive: z.boolean().optional(),
});

const verifySenderBody = z.object({
  /** How control of the inbox was proven, e.g. "DNS TXT" or "reply test". */
  method: trimmed.max(120),
});

const createSuppressionBody = z.object({
  scope: z.enum(GROWTH_SUPPRESSION_SCOPE),
  value: trimmed.max(320),
  reason: z.enum(GROWTH_SUPPRESSION_REASON),
  note: z.string().trim().max(1000).nullish(),
});

/** Normalizes a contact value for the comparison column. */
function normalizedContactValue(kind: string, value: string, countryCallingCode?: string | null): string {
  switch (kind.toUpperCase()) {
    case "EMAIL":
      return normalizeEmail(value) ?? "";
    case "PHONE":
    case "WHATSAPP":
      return normalizePhone(value, { countryCallingCode }) ?? "";
    case "DOMAIN":
      return normalizeDomain(value) ?? "";
    case "COMPANY":
      return normalizeCompany(value) ?? "";
    default:
      return value.trim().toLowerCase();
  }
}

function suppressionNormalizedValue(
  scope: string,
  value: string,
  countryCallingCode?: string | null,
): string {
  switch (scope.toUpperCase()) {
    case "EMAIL":
      return normalizeEmail(value) ?? "";
    case "PHONE":
      return normalizePhone(value, { countryCallingCode }) ?? "";
    case "DOMAIN":
      return normalizeDomain(value) ?? "";
    case "COMPANY":
      return normalizeCompany(value) ?? "";
    default:
      return value.trim().toLowerCase();
  }
}

export async function growthRoutes(app: FastifyInstance) {
  // ── Prospects ──────────────────────────────────────────────────────────────

  app.get("/prospects", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const parsed = listProspectsQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { q, lifecycle, source, assignedTo, city, includeMerged, limit, offset } = parsed.data;

    const conditions = [eq(growthProspects.orgId, orgId)];
    if (!includeMerged) conditions.push(isNull(growthProspects.mergedIntoId));
    if (lifecycle) conditions.push(eq(growthProspects.lifecycle, lifecycle));
    if (source) conditions.push(eq(growthProspects.source, source));
    if (assignedTo) conditions.push(eq(growthProspects.assignedTo, assignedTo));
    if (city) conditions.push(ilike(growthProspects.city, `%${city}%`));
    if (q) {
      // Search company, domain and notes, plus any contact detail value.
      const needle = `%${q.toLowerCase()}%`;
      conditions.push(
        or(
          ilike(growthProspects.companyName, `%${q}%`),
          ilike(growthProspects.websiteDomain, `%${q}%`),
          ilike(growthProspects.equipmentNeeds, `%${q}%`),
          ilike(growthProspects.notes, `%${q}%`),
          sql`exists (
            select 1 from growth_contact_details gcd
            where gcd.prospect_id = ${growthProspects.id}
              and gcd.normalized_value like ${needle}
          )`,
        )!,
      );
    }

    return db
      .select()
      .from(growthProspects)
      .where(and(...conditions))
      .orderBy(desc(growthProspects.updatedAt), asc(growthProspects.companyName))
      .limit(limit ?? 50)
      .offset(offset ?? 0);
  });

  app.get("/prospects/:id", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid prospect id" });

    const [prospect] = await db
      .select()
      .from(growthProspects)
      .where(and(eq(growthProspects.id, id), eq(growthProspects.orgId, orgId)));
    if (!prospect) return reply.code(404).send({ error: "prospect not found" });

    const contacts = await db
      .select()
      .from(growthContactDetails)
      .where(and(eq(growthContactDetails.prospectId, id), eq(growthContactDetails.orgId, orgId)))
      .orderBy(desc(growthContactDetails.isPrimary), asc(growthContactDetails.createdAt));

    return { ...prospect, contacts };
  });

  app.get("/prospects/duplicates/check", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const query = req.query as {
      company?: string;
      email?: string;
      phone?: string;
      domain?: string;
      countryCallingCode?: string;
    };
    const target = {
      company: query.company ?? null,
      email: query.email ?? null,
      phone: query.phone ?? null,
      domain: query.domain ?? null,
      countryCallingCode: query.countryCallingCode ?? null,
    };
    const candidates = await loadDuplicateCandidates(orgId, target, target.countryCallingCode);
    const matches = detectDuplicates(target, candidates);
    return { matches, blocking: hasHardDuplicate(matches) };
  });

  app.post("/prospects", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const parsed = createProspectBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const domain = normalizeDomain(body.websiteDomain);
    const countryCallingCode = body.countryCallingCode ?? null;
    const target = {
      company: body.companyName,
      domain,
      email: body.contacts?.find((contact) => contact.kind === "EMAIL")?.value ?? null,
      phone:
        body.contacts?.find((contact) => contact.kind === "PHONE" || contact.kind === "WHATSAPP")?.value ??
        null,
    };

    const candidates = await loadDuplicateCandidates(orgId, target, countryCallingCode);
    const matches = detectDuplicates({ ...target, countryCallingCode }, candidates);
    if (!body.force && hasHardDuplicate(matches)) {
      return reply.code(409).send({
        error: "a matching prospect already exists",
        matches,
        hint: "merge into the existing record, or resend with force: true",
      });
    }

    const [created] = await db
      .insert(growthProspects)
      .values({
        orgId,
        companyName: body.companyName,
        websiteDomain: domain,
        industry: body.industry ?? null,
        city: body.city ?? null,
        region: body.region ?? null,
        country: body.country ?? null,
        equipmentNeeds: body.equipmentNeeds ?? null,
        lifecycle: body.lifecycle ?? "NEW",
        source: body.source ?? "COLD_RESEARCH",
        sourceDetail: body.sourceDetail ?? null,
        notes: body.notes ?? null,
        assignedTo: body.assignedTo ?? null,
        verifiedAt: body.verified ? new Date() : null,
        createdBy: claims.userId,
      })
      .returning();

    if (body.contacts?.length) {
      await db.insert(growthContactDetails).values(
        body.contacts.map((contact) => ({
          orgId,
          prospectId: created.id,
          kind: contact.kind,
          label: contact.label ?? null,
          value: contact.value,
          normalizedValue: normalizedContactValue(contact.kind, contact.value, countryCallingCode),
          isPrimary: contact.isPrimary ?? false,
          source: contact.source ?? null,
          sourceUrl: contact.sourceUrl ?? null,
          sourceDate: contact.sourceDate ? new Date(contact.sourceDate) : null,
          createdBy: claims.userId,
        })),
      );
    }

    return reply.code(201).send(created);
  });

  app.patch("/prospects/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid prospect id" });
    const parsed = updateProspectBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const [existing] = await db
      .select({ id: growthProspects.id })
      .from(growthProspects)
      .where(and(eq(growthProspects.id, id), eq(growthProspects.orgId, orgId)));
    if (!existing) return reply.code(404).send({ error: "prospect not found" });

    const [updated] = await db
      .update(growthProspects)
      .set({
        ...(body.companyName !== undefined ? { companyName: body.companyName } : {}),
        ...(body.websiteDomain !== undefined
          ? { websiteDomain: normalizeDomain(body.websiteDomain) }
          : {}),
        ...(body.industry !== undefined ? { industry: body.industry } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.region !== undefined ? { region: body.region } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.equipmentNeeds !== undefined ? { equipmentNeeds: body.equipmentNeeds } : {}),
        ...(body.lifecycle !== undefined ? { lifecycle: body.lifecycle } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.sourceDetail !== undefined ? { sourceDetail: body.sourceDetail } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
        ...(body.verified !== undefined ? { verifiedAt: body.verified ? new Date() : null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(growthProspects.id, id), eq(growthProspects.orgId, orgId)))
      .returning();

    return updated;
  });

  app.post("/prospects/:id/contacts", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid prospect id" });
    const parsed = addContactBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const contact = parsed.data;

    const [existing] = await db
      .select({ id: growthProspects.id })
      .from(growthProspects)
      .where(and(eq(growthProspects.id, id), eq(growthProspects.orgId, orgId)));
    if (!existing) return reply.code(404).send({ error: "prospect not found" });

    const [created] = await db
      .insert(growthContactDetails)
      .values({
        orgId,
        prospectId: id,
        kind: contact.kind,
        label: contact.label ?? null,
        value: contact.value,
        normalizedValue: normalizedContactValue(contact.kind, contact.value, contact.countryCallingCode ?? null),
        isPrimary: contact.isPrimary ?? false,
        source: contact.source ?? null,
        sourceUrl: contact.sourceUrl ?? null,
        sourceDate: contact.sourceDate ? new Date(contact.sourceDate) : null,
        createdBy: claims.userId,
      })
      .returning();

    return reply.code(201).send(created);
  });

  // Merge one prospect into another. The source row is retained for audit and
  // hidden from lists; its contacts move to the surviving record.
  app.post("/prospects/:id/merge", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = mergeBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { intoId } = parsed.data;
    if (id === intoId) return reply.code(400).send({ error: "cannot merge a prospect into itself" });
    if (!uuid.safeParse(id).success || !uuid.safeParse(intoId).success) {
      return reply.code(400).send({ error: "invalid prospect id" });
    }

    const rows = await db
      .select({ id: growthProspects.id, mergedIntoId: growthProspects.mergedIntoId })
      .from(growthProspects)
      .where(
        and(
          eq(growthProspects.orgId, orgId),
          inArray(growthProspects.id, [id, intoId]),
        ),
      );
    if (rows.length !== 2) return reply.code(404).send({ error: "prospect not found" });
    const target = rows.find((row) => row.id === intoId);
    if (!target || target.mergedIntoId) {
      return reply.code(409).send({ error: "cannot merge into a merged prospect" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(growthContactDetails)
        .set({ prospectId: intoId })
        .where(and(eq(growthContactDetails.prospectId, id), eq(growthContactDetails.orgId, orgId)));
      await tx
        .update(growthProspects)
        .set({ mergedIntoId: intoId, updatedAt: new Date() })
        .where(and(eq(growthProspects.id, id), eq(growthProspects.orgId, orgId)));
    });

    return { merged: id, into: intoId };
  });

  // ── Sender identities ─────────────────────────────────────────────────────

  app.get("/senders", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    return db
      .select()
      .from(growthSenderIdentities)
      .where(eq(growthSenderIdentities.orgId, orgId))
      .orderBy(asc(growthSenderIdentities.displayName));
  });

  app.post("/senders", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const parsed = createSenderBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // New identities always start PENDING. Verification is a separate, recorded
    // step so an identity cannot be created already approved for outreach.
    const [created] = await db
      .insert(growthSenderIdentities)
      .values({
        orgId,
        displayName: parsed.data.displayName,
        email: parsed.data.email.toLowerCase(),
        replyToEmail: parsed.data.replyToEmail?.toLowerCase() ?? null,
        roleTitle: parsed.data.roleTitle ?? null,
        verificationState: "PENDING",
        createdBy: claims.userId,
      })
      .returning();

    return reply.code(201).send(created);
  });

  app.patch("/senders/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid sender id" });
    const parsed = updateSenderBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const [updated] = await db
      .update(growthSenderIdentities)
      .set({
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.replyToEmail !== undefined
          ? { replyToEmail: body.replyToEmail?.toLowerCase() ?? null }
          : {}),
        ...(body.roleTitle !== undefined ? { roleTitle: body.roleTitle } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(growthSenderIdentities.id, id), eq(growthSenderIdentities.orgId, orgId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "sender identity not found" });

    return updated;
  });

  // Verification records proof that the operator controls the inbox. Owner-only.
  app.post("/senders/:id/verify", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    if (!canManageSenderIdentities(claims.role)) {
      return reply.code(403).send({ error: "verifying a sender identity requires an owner" });
    }
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid sender id" });
    const parsed = verifySenderBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [updated] = await db
      .update(growthSenderIdentities)
      .set({
        verificationState: "VERIFIED",
        verificationMethod: parsed.data.method,
        verifiedAt: new Date(),
        // A newly verified inbox must be re-approved for cold outreach.
        coldApproved: false,
        coldApprovedBy: null,
        coldApprovedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(growthSenderIdentities.id, id), eq(growthSenderIdentities.orgId, orgId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "sender identity not found" });

    return updated;
  });

  // Owner approval to use a verified inbox for cold outreach. Refused unless
  // the identity is verified, so an unproven persona can never be approved.
  app.post("/senders/:id/approve-cold", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    if (!canManageSenderIdentities(claims.role)) {
      return reply.code(403).send({ error: "approving cold outreach requires an owner" });
    }
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid sender id" });

    const [identity] = await db
      .select()
      .from(growthSenderIdentities)
      .where(and(eq(growthSenderIdentities.id, id), eq(growthSenderIdentities.orgId, orgId)));
    if (!identity) return reply.code(404).send({ error: "sender identity not found" });
    if (identity.verificationState !== "VERIFIED") {
      return reply.code(409).send({
        error: "sender identity must be verified before it can be approved for cold outreach",
        verificationState: identity.verificationState,
      });
    }

    const [updated] = await db
      .update(growthSenderIdentities)
      .set({ coldApproved: true, coldApprovedBy: claims.userId, coldApprovedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(growthSenderIdentities.id, id), eq(growthSenderIdentities.orgId, orgId)))
      .returning();

    return updated;
  });

  app.post("/senders/:id/revoke-cold", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    if (!canManageSenderIdentities(claims.role)) {
      return reply.code(403).send({ error: "revoking cold approval requires an owner" });
    }
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid sender id" });

    const [updated] = await db
      .update(growthSenderIdentities)
      .set({ coldApproved: false, coldApprovedBy: null, coldApprovedAt: null, updatedAt: new Date() })
      .where(and(eq(growthSenderIdentities.id, id), eq(growthSenderIdentities.orgId, orgId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "sender identity not found" });

    return updated;
  });

  // ── Suppression ───────────────────────────────────────────────────────────

  app.get("/suppressions", async (req, reply) => {
    const claims = await requireGrowthRead(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const query = req.query as { scope?: string; reason?: string; limit?: string };
    const conditions = [eq(growthSuppressions.orgId, orgId)];
    const scope = GROWTH_SUPPRESSION_SCOPE.find((value) => value === query.scope);
    if (scope) conditions.push(eq(growthSuppressions.scope, scope));
    const reason = GROWTH_SUPPRESSION_REASON.find((value) => value === query.reason);
    if (reason) conditions.push(eq(growthSuppressions.reason, reason));

    return db
      .select()
      .from(growthSuppressions)
      .where(and(...conditions))
      .orderBy(desc(growthSuppressions.createdAt))
      .limit(Math.min(Number(query.limit) || 200, 500));
  });

  app.post("/suppressions", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const parsed = createSuppressionBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const body = parsed.data;

    const normalizedValue = suppressionNormalizedValue(body.scope, body.value);
    if (!normalizedValue) return reply.code(400).send({ error: "suppression value is not valid" });

    // The unique index makes suppression idempotent, so a repeated opt-out
    // refreshes the reason instead of failing.
    const [existing] = await db
      .select({ id: growthSuppressions.id })
      .from(growthSuppressions)
      .where(
        and(
          eq(growthSuppressions.orgId, orgId),
          eq(growthSuppressions.scope, body.scope),
          eq(growthSuppressions.normalizedValue, normalizedValue),
        ),
      );
    if (existing) {
      const [updated] = await db
        .update(growthSuppressions)
        .set({ reason: body.reason, note: body.note ?? null, value: body.value })
        .where(eq(growthSuppressions.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(growthSuppressions)
      .values({
        orgId,
        scope: body.scope,
        value: body.value,
        normalizedValue,
        reason: body.reason,
        note: body.note ?? null,
        createdBy: claims.userId,
      })
      .returning();

    return reply.code(201).send(created);
  });

  app.delete("/suppressions/:id", async (req, reply) => {
    const claims = await requireGrowthWrite(req, reply);
    if (!claims) return;
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: "invalid suppression id" });

    const [deleted] = await db
      .delete(growthSuppressions)
      .where(and(eq(growthSuppressions.id, id), eq(growthSuppressions.orgId, orgId)))
      .returning({ id: growthSuppressions.id });
    if (!deleted) return reply.code(404).send({ error: "suppression not found" });

    return { deleted: deleted.id };
  });
}

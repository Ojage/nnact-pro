// Deterministic, self-contained semantic retrieval for the Repair Brain.
//
// This is a zero-dependency vector store built on top of Redis. Each knowledge
// item (fault / procedure / part) is embedded with a hashing trick over
// character n-grams, so short and misspelled appliance terms still produce
// overlapping vectors the way an embedding model would — no external API keys,
// no pgvector migration, works fully offline. Cosine similarity ranks results.

import { db, knownFaults, repairProcedures, modelParts } from "@nnact/db";
import { eq } from "drizzle-orm";
import { cacheGetJSON, cacheSetJSON } from "./repair-brain-cache.js";

const DIM = 256;
const NGRAM = 3;
const VECTOR_TTL = 60 * 60 * 24; // 24h

export interface SemanticHit {
  kind: "fault" | "procedure" | "part";
  id: string;
  equipmentModelId: string | null;
  title: string;
  snippet: string;
  score: number;
}

// ── Embedding primitives ──────────────────────────────────────────────

function tokenize(text: string): string[] {
  const c = (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!c) return [];
  const tokens = c.split(" ").filter((t) => t.length > 1);
  const ngrams = new Set<string>();
  for (const token of tokens) {
    ngrams.add(token);
    for (let i = 0; i + NGRAM <= token.length; i++) {
      ngrams.add(token.slice(i, i + NGRAM));
    }
  }
  return [...ngrams];
}

/** FNV-1a hash → normalized coordinate index. */
function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

function embed(text: string): number[] {
  const vec = new Float64Array(DIM);
  for (const token of tokenize(text)) {
    vec[hashToken(token)] += 1;
  }
  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from(vec);
  return Array.from(vec, (v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Storing a 256-dim float array as JSON ~ a few KB per item; acceptable.
const vectorKey = (orgId: string) => `rb:emb:${orgId}:items`;

// ── Index building ────────────────────────────────────────────────────

interface IndexItem {
  kind: "fault" | "procedure" | "part";
  id: string;
  equipmentModelId: string | null;
  title: string;
  text: string;
}

async function buildIndex(orgId: string): Promise<IndexItem[]> {
  const [faults, procedures, parts] = await Promise.all([
    db
      .select({ id: knownFaults.id, equipmentModelId: knownFaults.equipmentModelId, title: knownFaults.title, text: knownFaults.description })
      .from(knownFaults)
      .where(eq(knownFaults.orgId, orgId)),
    db
      .select({ id: repairProcedures.id, equipmentModelId: repairProcedures.equipmentModelId, title: repairProcedures.title, text: repairProcedures.description })
      .from(repairProcedures)
      .where(eq(repairProcedures.orgId, orgId)),
    db
      .select({ id: modelParts.id, equipmentModelId: modelParts.equipmentModelId, title: modelParts.partName, text: modelParts.partName })
      .from(modelParts)
      .where(eq(modelParts.orgId, orgId)),
  ]);

  return [
    ...faults.map((f) => ({ kind: "fault" as const, id: f.id, equipmentModelId: f.equipmentModelId, title: f.title, text: `${f.title} ${f.text ?? ""}` })),
    ...procedures.map((p) => ({ kind: "procedure" as const, id: p.id, equipmentModelId: p.equipmentModelId, title: p.title, text: `${p.title} ${p.text ?? ""}` })),
    ...parts.map((p) => ({ kind: "part" as const, id: p.id, equipmentModelId: p.equipmentModelId, title: p.title, text: p.text })),
  ];
}

// ── Public search ─────────────────────────────────────────────────────

export async function semanticSearch(
  orgId: string,
  query: string,
  limit = 8,
): Promise<{ available: boolean; hits: SemanticHit[] }> {
  const qvec = embed(query);
  if (qvec.every((v) => v === 0)) return { available: true, hits: [] };

  const baseKey = vectorKey(orgId);
  let cache: { items: IndexItem[]; vectors: number[][] } | null =
    await cacheGetJSON<{ items: IndexItem[]; vectors: number[][] }>(baseKey);

  if (!cache) {
    const items = await buildIndex(orgId);
    const vectors = items.map((it) => embed(it.text));
    cache = { items, vectors };
    await cacheSetJSON(baseKey, cache, VECTOR_TTL);
  }

  const scored: Array<{ hit: SemanticHit; score: number }> = [];
  for (let i = 0; i < cache.items.length; i++) {
    const it = cache.items[i];
    const score = cosine(qvec, cache.vectors[i]);
    if (score <= 0) continue;
    scored.push({
      score,
      hit: {
        kind: it.kind,
        id: it.id,
        equipmentModelId: it.equipmentModelId,
        title: it.title,
        snippet: it.text.slice(0, 140),
        score: Math.round(score * 1000) / 1000,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return { available: true, hits: scored.slice(0, limit).map((s) => s.hit) };
}

// Warm the per-org item cache without running a query (called opportunistically).
export async function warmSemanticIndex(orgId: string): Promise<void> {
  try {
    const baseKey = vectorKey(orgId);
    if (await cacheGetJSON<unknown>(baseKey)) return;
    const items = await buildIndex(orgId);
    await cacheSetJSON(baseKey, { items, vectors: items.map((it) => embed(it.text)) }, VECTOR_TTL);
  } catch {
    /* no-op */
  }
}

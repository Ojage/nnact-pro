/**
 * Walkthrough progress persistence — server-authoritative with a local cache.
 *
 * Storage model:
 *  - Server: users.walkthrough_progress JSONB, keyed by tour id (PATCH upserts
 *    per key via /api/me/walkthrough-progress).
 *  - Local: localStorage journal (`nnact:walkthrough:progress`) survives
 *    offline or a temporary auth blip and seeds the UI instantly on boot.
 *
 * Reconciliation rule: for a tour id present in both sides, the record with the
 * later `updatedAt` wins (tie → server). Because PATCH merges per key, writing
 * the full local map through is safe and idempotent.
 *
 * The pure functions are unit-tested; the fetch glue lives in the provider.
 */

import type { WalkthroughProgressMap, WalkthroughProgressRecord } from "@nnact/shared";

export const LOCAL_PROGRESS_KEY = "nnact:walkthrough:progress";

export type StorageLike = Pick<Storage, "getItem" | "setItem"> | null;

export function loadLocalProgress(storage: StorageLike = storageOf()): WalkthroughProgressMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LOCAL_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as WalkthroughProgressMap;
  } catch {
    return {};
  }
}

export function saveLocalProgress(map: WalkthroughProgressMap, storage: StorageLike = storageOf()): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Quota/full storage — best-effort cache, the server copy still stands.
  }
}

/** Later-updated wins; ties favor `primary` (the server snapshot). */
export function mergeProgress(
  primary: WalkthroughProgressMap,
  secondary: WalkthroughProgressMap,
): WalkthroughProgressMap {
  const merged: WalkthroughProgressMap = { ...primary };
  for (const [tourId, record] of Object.entries(secondary)) {
    const existing = merged[tourId];
    if (!existing) {
      merged[tourId] = record;
      continue;
    }
    if (compareRecords(record, existing) > 0) merged[tourId] = record;
  }
  return merged;
}

/** 1 if a is newer than b, -1, or 0 when timestamp-equal/indistinguishable. */
export function compareRecords(a: WalkthroughProgressRecord, b: WalkthroughProgressRecord): number {
  const at = a?.updatedAt ?? "";
  const bt = b?.updatedAt ?? "";
  if (at === bt) return 0;
  if (!at) return -1;
  if (!bt) return 1;
  return at > bt ? 1 : -1;
}

/** Coerce an unknown persisted value into a valid progress map (defensive). */
export function normalizeProgress(raw: unknown): WalkthroughProgressMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const map: WalkthroughProgressMap = {};
  for (const [tourId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const record = value as Partial<WalkthroughProgressRecord>;
    if (typeof record.state !== "string" || typeof record.updatedAt !== "string") continue;
    map[tourId] = {
      state: record.state as WalkthroughProgressRecord["state"],
      step: typeof record.step === "number" ? record.step : 0,
      version: typeof record.version === "number" ? record.version : 1,
      starts: typeof record.starts === "number" ? record.starts : 0,
      completions: typeof record.completions === "number" ? record.completions : 0,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      updatedAt: record.updatedAt,
    };
  }
  return map;
}

function storageOf(): StorageLike {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}
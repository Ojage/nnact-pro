import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { WalkthroughProgressRecord } from "@nnact/shared";
import {
  compareRecords,
  LOCAL_PROGRESS_KEY,
  loadLocalProgress,
  mergeProgress,
  normalizeProgress,
  saveLocalProgress,
} from "./progress";

function record(updatedAt: string, overrides: Partial<WalkthroughProgressRecord> = {}): WalkthroughProgressRecord {
  return { state: "in_progress", step: 1, version: 1, starts: 1, completions: 0, updatedAt, ...overrides };
}

const EMPTY_STORAGE = { getItem: () => null, setItem: () => {} };

test("compareRecords picks the later updatedAt", () => {
  assert.equal(compareRecords(record("2026-01-02"), record("2026-01-01")), 1);
  assert.equal(compareRecords(record("2026-01-01"), record("2026-01-02")), -1);
  assert.equal(compareRecords(record("2026-01-01"), record("2026-01-01")), 0);
  assert.equal(compareRecords(record(""), record("2026-01-01")), -1);
  assert.equal(compareRecords(record("2026-01-01"), record("")), 1);
});

test("mergeProgress: later wins, ties favor primary (server)", () => {
  const server = { a: record("2026-01-01", { step: 2 }), b: record("2026-01-01", { step: 9 }) };
  const local = { b: record("2026-01-01", { step: 1 }) };
  const merged = mergeProgress(server, local);
  assert.equal(merged.a.step, 2);
  assert.equal(merged.b.step, 9);
});

test("mergeProgress: secondary additions are retained, primary survives conflicts", () => {
  const server = { keep: record("2026-01-03") };
  const local = { extra: record("2026-01-02"), keep: record("2026-01-01", { step: 3 }) };
  const merged = mergeProgress(server, local);
  assert.equal(merged.keep.step, 1);
  assert.equal(merged.extra.updatedAt, "2026-01-02");
});

test("normalizeProgress drops malformed entries and defaults non-numeric fields", () => {
  const raw = {
    good: { state: "in_progress", updatedAt: "2026-01-01", step: "2", starts: "1", version: null },
    badState: { state: 5, updatedAt: "2026-01-01" },
    noTimestamp: { state: "in_progress" },
    array: [1, 2],
    string: "nope",
  };
  const normalized = normalizeProgress(raw);
  assert.deepEqual(Object.keys(normalized), ["good"]);
  assert.equal(normalized.good.step, 0);
  assert.equal(normalized.good.starts, 0);
  assert.equal(normalized.good.version, 1);
  assert.equal(normalized.good.completions, 0);
});

test("local storage round-trips the progress map", () => {
  const dir = join(tmpdir(), `nnact-wt-${Date.now()}`);
  mkdirSync(dir);
  let current: string | null = null;
  const backing = {
    getItem: (key: string) => (key === LOCAL_PROGRESS_KEY ? current : null),
    setItem: (key: string, value: string) => {
      if (key === LOCAL_PROGRESS_KEY) current = value;
    },
  };
  try {
    const map = { a: record("2026-01-01"), b: record("2026-01-02", { state: "completed" }) };
    saveLocalProgress(map, backing);
    assert.equal(loadLocalProgress(backing).b.state, "completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadLocalProgress is defensive on corrupt data and missing storage", () => {
  const corrupt = { getItem: () => "{not json", setItem: () => {} };
  assert.deepEqual(loadLocalProgress(corrupt), {});
  assert.deepEqual(loadLocalProgress(corrupt), {});
  assert.deepEqual(loadLocalProgress(EMPTY_STORAGE), {});
  assert.deepEqual(loadLocalProgress(null), {});
});

test("saveLocalProgress swallows storage failures", () => {
  const failing = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.doesNotThrow(() => saveLocalProgress({ a: record("2026-01-01") }, failing));
});
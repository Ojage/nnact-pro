import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { patchOf } from "../src/zod-patch.js";

const JobLike = z
  .object({
    title: z.string().min(1),
    status: z.enum(["new", "completed"]).default("new"),
    total: z.number().int().nonnegative().optional().default(0),
    notes: z.string().nullable().default(null),
  })
  .strict();

test("a partial update keeps only the keys the client sent", () => {
  // Zod 4's .partial() would fill status, total and notes with their
  // defaults here and overwrite the stored values.
  assert.deepEqual(patchOf(JobLike).parse({ title: "Renamed" }), { title: "Renamed" });
});

test("a sent key is validated and returned as sent", () => {
  assert.deepEqual(patchOf(JobLike).parse({ status: "completed", notes: null }), { status: "completed", notes: null });
  assert.equal(patchOf(JobLike).safeParse({ total: -1 }).success, false);
});

test("strict objects still reject unknown keys", () => {
  assert.equal(patchOf(JobLike).safeParse({ unknown: true }).success, false);
});

test("the create schema keeps its defaults", () => {
  assert.deepEqual(JobLike.parse({ title: "New" }), { title: "New", status: "new", total: 0, notes: null });
});

import assert from "node:assert/strict";
import test from "node:test";
import { isRecordId } from "./prefetch-route.js";

test("isRecordId accepts uuid route segments", () => {
  assert.equal(isRecordId("f47ac10b-58cc-4372-a567-0e02b2c3d479"), true);
  assert.equal(isRecordId("F47AC10B-58CC-4372-A567-0E02B2C3D479"), true);
});

test("isRecordId rejects create and non-uuid segments", () => {
  assert.equal(isRecordId("new"), false);
  assert.equal(isRecordId("create"), false);
  assert.equal(isRecordId("add"), false);
  assert.equal(isRecordId("123"), false);
  assert.equal(isRecordId(".."), false);
  assert.equal(isRecordId(""), false);
});
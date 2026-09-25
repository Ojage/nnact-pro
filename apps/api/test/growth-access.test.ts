import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canManageSenderIdentities,
  canReadGrowth,
  canWriteGrowth,
} from "../src/growth/access.js";

const ROLES = ["owner", "dispatcher", "secretary", "technician"] as const;

test("owners and dispatchers may write growth records", () => {
  assert.equal(canWriteGrowth("owner"), true);
  assert.equal(canWriteGrowth("dispatcher"), true);
  assert.equal(canWriteGrowth("secretary"), false);
  assert.equal(canWriteGrowth("technician"), false);
});

test("secretaries can read growth but technicians cannot", () => {
  assert.equal(canReadGrowth("owner"), true);
  assert.equal(canReadGrowth("dispatcher"), true);
  assert.equal(canReadGrowth("secretary"), true);
  assert.equal(canReadGrowth("technician"), false);
});

test("only an owner may verify a sender or approve cold outreach", () => {
  assert.equal(canManageSenderIdentities("owner"), true);
  for (const role of ROLES.filter((value) => value !== "owner")) {
    assert.equal(canManageSenderIdentities(role), false);
  }
});

test("an unknown role gets no growth access at all", () => {
  for (const role of ["", "admin", "OWNER", "groot"]) {
    assert.equal(canReadGrowth(role), false);
    assert.equal(canWriteGrowth(role), false);
    assert.equal(canManageSenderIdentities(role), false);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedUdtName } from "../../../packages/db/src/udt-name.js";

test("maps array SQL types to the catalog's underscore-prefixed name", () => {
  // Postgres reports the array type of uuid[] as _uuid in information_schema.
  assert.equal(expectedUdtName("uuid[]"), "_uuid");
  assert.equal(expectedUdtName("text[]"), "_text");
});

test("resolves the element type before prefixing an array name", () => {
  // The underscore attaches to the catalog name, not the SQL spelling: the
  // array of integer is _int4, not _integer.
  assert.equal(expectedUdtName("integer[]"), "_int4");
  assert.equal(expectedUdtName("boolean[]"), "_bool");
  assert.equal(expectedUdtName("timestamp with time zone[]"), "_timestamptz");
});

test("maps scalar SQL types that Postgres renames", () => {
  assert.equal(expectedUdtName("boolean"), "bool");
  assert.equal(expectedUdtName("integer"), "int4");
  assert.equal(expectedUdtName("timestamp with time zone"), "timestamptz");
});

test("leaves types Postgres already reports verbatim", () => {
  assert.equal(expectedUdtName("text"), "text");
  assert.equal(expectedUdtName("uuid"), "uuid");
  assert.equal(expectedUdtName("timestamptz"), "timestamptz");
});

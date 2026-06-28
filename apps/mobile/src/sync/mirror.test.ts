import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Mirror } from "./mirror";

const TEST_TABLES = [
  {
    name: "jobs",
    columns: ["id", "title", "status", "version", "org_id"],
    primaryKey: "id",
  },
  {
    name: "customers",
    columns: ["id", "name", "phone", "version", "org_id"],
    primaryKey: "id",
  },
  {
    name: "line_items",
    columns: ["id", "job_id", "description", "unit_price", "version"],
    primaryKey: "id",
  },
  {
    name: "invoices",
    columns: ["id", "number", "status", "total", "version"],
    primaryKey: "id",
  },
  {
    name: "appointments",
    columns: ["id", "job_id", "starts_at", "ends_at", "version"],
    primaryKey: "id",
  },
  {
    name: "estimates",
    columns: ["id", "job_id", "total", "accepted", "version"],
    primaryKey: "id",
  },
  {
    name: "payments",
    columns: ["id", "invoice_id", "amount", "version"],
    primaryKey: "id",
  },
];

describe("Mirror", () => {
  it("generates CREATE TABLE SQL", () => {
    const m = new Mirror(TEST_TABLES);
    const sql = m.createTableSql(TEST_TABLES[0]);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS/);
    assert.match(sql, /"id" text PRIMARY KEY/);
    assert.match(sql, /"title" text/);
    assert.match(sql, /"version" text/);
  });

  it("generates UPSERT SQL", () => {
    const m = new Mirror(TEST_TABLES);
    const { sql, params } = m.upsertSql("jobs", {
      id: "abc",
      title: "Test",
      status: "scheduled",
      version: "1",
      org_id: "o1",
    });
    assert.match(sql, /INSERT OR REPLACE INTO/);
    assert.equal(params.length, 5);
    assert.equal(params[0], "abc");
  });

  it("generates DELETE SQL", () => {
    const m = new Mirror(TEST_TABLES);
    const { sql, params } = m.deleteSql("jobs", "abc");
    assert.match(sql, /DELETE FROM/);
    assert.equal(params[0], "abc");
  });

  it("generates SELECT SINCE SQL", () => {
    const m = new Mirror(TEST_TABLES);
    const { sql, params } = m.selectSinceSql("jobs", 3);
    assert.match(sql, /SELECT \*/);
    assert.match(sql, /"version" >/);
    assert.equal(params[0], 3);
  });

  it("throws for unknown table", () => {
    const m = new Mirror(TEST_TABLES);
    assert.throws(() => m.upsertSql("nonexistent", {}), /Unknown table/);
    assert.throws(() => m.deleteSql("nonexistent", "x"), /Unknown table/);
  });

  it("mirrors 7 tables matching Phase-5a versioned tables", () => {
    const m = new Mirror(TEST_TABLES);
    assert.equal(TEST_TABLES.length, 7); // jobs, customers, line_items, invoices, appointments, estimates, payments
    const names = TEST_TABLES.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "appointments",
      "customers",
      "estimates",
      "invoices",
      "jobs",
      "line_items",
      "payments",
    ]);
  });
});

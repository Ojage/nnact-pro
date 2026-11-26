import assert from "node:assert/strict";
import test from "node:test";

import {
  highlightRanges,
  MODULE_CATALOG,
  MODULE_SECTIONS,
  modulesForRole,
  searchModules,
  sectionCounts,
} from "./modules";
import { canAccessRoute, NAV_LINKS } from "./nav";

test("module catalog covers every navigation link exactly once", () => {
  assert.equal(MODULE_CATALOG.length, NAV_LINKS.length);
  assert.deepEqual(
    MODULE_CATALOG.map((entry) => entry.href),
    NAV_LINKS.map((link) => link.href),
  );
  assert.equal(new Set(MODULE_CATALOG.map((entry) => entry.id)).size, MODULE_CATALOG.length);
  for (const entry of MODULE_CATALOG) {
    assert.ok(MODULE_SECTIONS.includes(entry.section));
    assert.ok(entry.description.length > 12, `${entry.href} needs a useful description`);
    assert.ok(entry.icon);
  }
});

test("role-filtered catalog never exposes an inaccessible route", () => {
  for (const role of ["owner", "dispatcher", "secretary", "technician"] as const) {
    for (const entry of modulesForRole(role)) {
      assert.ok(canAccessRoute(role, entry.href), `${role} -> ${entry.href}`);
      assert.ok(entry.roles.includes(role));
    }
  }
  const technicianHrefs = modulesForRole("technician").map((entry) => entry.href);
  assert.ok(technicianHrefs.includes("/jobs"));
  assert.ok(!technicianHrefs.includes("/settings"));
  assert.deepEqual(modulesForRole(undefined), modulesForRole("technician"));
});

test("search matches exact labels, keywords, and fuzzy typos", () => {
  const owner = modulesForRole("owner");
  assert.ok(searchModules(owner, { query: "invoices" }).some((result) => result.entry.href === "/invoices"));
  assert.ok(searchModules(owner, { query: "invoces" }).some((result) => result.entry.href === "/invoices"));
  assert.ok(searchModules(owner, { query: "ai usage" }).some((result) => result.entry.href === "/ai/usage"));
  assert.ok(searchModules(owner, { query: "growth sender" }).some((result) => result.entry.href === "/growth/senders"));
  assert.ok(!searchModules(owner, { query: "invoice growth" }).some((result) => result.entry.href === "/invoices"));
});

test("filters and sorting narrow the catalog", () => {
  const owner = modulesForRole("owner");
  const finance = searchModules(owner, { sections: ["Finance"], sort: "name" });
  assert.ok(finance.length > 0);
  assert.ok(finance.every((result) => result.entry.section === "Finance"));
  assert.deepEqual(
    finance.map((result) => result.entry.label),
    [...finance.map((result) => result.entry.label)].sort((a, b) => a.localeCompare(b)),
  );

  const favorites = searchModules(owner, { filter: "favorites", favorites: ["/jobs", "/settings"] });
  assert.deepEqual(favorites.map((result) => result.entry.href).sort(), ["/jobs", "/settings"]);

  const recent = searchModules(owner, { filter: "recent", recent: ["/invoices"] });
  assert.deepEqual(recent.map((result) => result.entry.href), ["/invoices"]);

  const counts = sectionCounts(owner);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), owner.length);
});

test("highlight ranges cover each query term and merge overlaps", () => {
  assert.deepEqual(highlightRanges("Customer invoices and payments", "invoice pay"), [
    { start: 9, end: 16 },
    { start: 22, end: 25 },
  ]);
  assert.deepEqual(highlightRanges("Invoices", "invoice inv"), [{ start: 0, end: 7 }]);
  assert.deepEqual(highlightRanges("Invoices", ""), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { EXPENSE_DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS } from "../src/finance.ts";

const normalize = (s) => s.toLowerCase().replace(/&(amp;)?/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

test("recommended expense categories: 45 unique names with no duplicates", () => {
  const names = [...EXPENSE_DEFAULT_CATEGORIES];
  assert.equal(names.length, 45);
  assert.equal(new Set(names).size, 45, "categories must be unique");
  assert.equal(new Set(names.map(normalize)).size, 45, "categories must be unique after normalization");
});

test("recommended expense categories cover the required NNACT spend areas", () => {
  const required = [
    "Materials & Consumables",
    "Spare Parts",
    "Refrigerants & Gases",
    "Tools & Equipment",
    "Transport",
    "Fuel",
    "Delivery & Logistics",
    "Parking & Road Charges",
    "Field Accommodation",
    "Food & Refreshments",
    "Staff Welfare",
    "Training & Development",
    "Uniforms & Safety Equipment",
    "Vehicle Maintenance & Repairs",
    "Vehicle Parts",
    "Vehicle Insurance & Documentation",
    "Rent & Premises",
    "Electricity",
    "Water",
    "Internet",
    "Phone, Airtime & Data",
    "Generator Operating Costs",
    "Cleaning & Sanitation",
    "Office & Workshop Maintenance",
    "Office Supplies",
    "Printing & Stationery",
    "Software & Subscriptions",
    "Bank Charges",
    "Mobile Money Fees",
    "Professional & Consultancy Fees",
    "Licences, Permits & Regulatory Fees",
    "Taxes & Government Fees",
    "Marketing & Advertising",
    "Printed Marketing Materials",
    "Content & Media",
    "Customer Relations",
    "Subcontractors",
    "Temporary Labour",
    "Staff Reimbursements",
    "Equipment Purchases",
    "Furniture & Fixtures",
    "IT Equipment",
    "Emergency Purchases",
    "Miscellaneous",
  ];
  for (const name of required) {
    assert.ok(
      EXPENSE_DEFAULT_CATEGORIES.some((c) => normalize(c) === normalize(name)),
      `missing required category: ${name}`,
    );
  }
});

test("Miscellaneous is present but kept last in the selector order", () => {
  assert.equal(EXPENSE_DEFAULT_CATEGORIES[EXPENSE_DEFAULT_CATEGORIES.length - 1], "Miscellaneous");
});

test("recommended cost centers: 14 entries with unique codes and names", () => {
  assert.equal(DEFAULT_COST_CENTERS.length, 14);
  assert.equal(new Set(DEFAULT_COST_CENTERS.map((c) => c.name)).size, 14, "cost center names must be unique");
  const codes = DEFAULT_COST_CENTERS.map((c) => c.code).filter(Boolean);
  assert.equal(new Set(codes).size, codes.length, "cost center codes must be unique");
});

test("recommended cost centers cover the required NNACT departments", () => {
  const expected = {
    "Field Operations": "FIELD-OPS",
    "HVAC & Air Conditioning": "HVAC",
    "Refrigeration & Cold Rooms": "REFRIGERATION",
    "Home Appliances": "APPLIANCES",
    "Electrical & Power Systems": "ELECTRICAL",
    "Solar & Inverters": "SOLAR",
    "Generators": "GENERATORS",
    "Automotive Cooling": "AUTO-AC",
    "Commercial & Industrial Services": "COMMERCIAL",
    "Administration": "ADMIN",
    "Sales & Marketing": "MARKETING",
    "Training & People Development": "PEOPLE",
    "Workshop & Facilities": "FACILITIES",
    "Management & Corporate": "CORPORATE",
  };
  for (const [name, code] of Object.entries(expected)) {
    const match = DEFAULT_COST_CENTERS.find((c) => normalize(c.name) === normalize(name));
    assert.ok(match, `missing required cost center: ${name}`);
    assert.equal(match.code, code, `expected code ${code} for ${name}`);
  }
});

test("every cost center has a description explaining scope", () => {
  for (const cc of DEFAULT_COST_CENTERS) {
    assert.ok(typeof cc.description === "string" && cc.description.length > 0, `${cc.name} missing description`);
  }
});
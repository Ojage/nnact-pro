import assert from "node:assert/strict";
import test from "node:test";
import { optionsIdentical, estimateChecks } from "../src/estimate-checks.ts";

test("single option is never identical", () => {
  const options = [{ id: "1", label: "A", total: 50000, lines: [{ description: "Evaporator", quantity: 2, unitPrice: 20000 }] }];
  assert.equal(optionsIdentical(options), false);
});

test("two options with same lines and totals are identical", () => {
  const lines = [
    { description: "Evaporator", quantity: 2, unitPrice: 20000 },
    { description: "Labor", quantity: 1, unitPrice: 10000 },
  ];
  const options = [
    { id: "1", label: "Good", total: 50000, lines },
    { id: "2", label: "Better", total: 50000, lines },
  ];
  assert.ok(optionsIdentical(options));
});

test("three identical options detected", () => {
  const lines = [
    { description: "Evaporator", quantity: 2, unitPrice: 20000 },
    { description: "Labor", quantity: 1, unitPrice: 10000 },
  ];
  const options = [
    { id: "1", label: "Good", total: 50000, lines },
    { id: "2", label: "Better", total: 50000, lines },
    { id: "3", label: "Best", total: 50000, lines },
  ];
  assert.ok(optionsIdentical(options));
  const checks = estimateChecks({ options, scope: "Install 2 evaporators" });
  assert.ok(checks.identicalOptions);
  assert.equal(checks.identicalOptionMessage, "These options are identical. Differentiate the options or use a single estimate.");
});

test("options with different totals are not identical", () => {
  const lines = [{ description: "Evaporator", quantity: 2, unitPrice: 20000 }];
  const options = [
    { id: "1", label: "A", total: 40000, lines },
    { id: "2", label: "B", total: 50000, lines },
  ];
  assert.equal(optionsIdentical(options), false);
});

test("options with different line descriptions are not identical", () => {
  const options = [
    { id: "1", label: "A", total: 40000, lines: [{ description: "Evaporator", quantity: 2, unitPrice: 20000 }] },
    { id: "2", label: "B", total: 40000, lines: [{ description: "Condenser", quantity: 2, unitPrice: 20000 }] },
  ];
  assert.equal(optionsIdentical(options), false);
});

test("scope missing priced line warned", () => {
  const checks = estimateChecks({
    options: [
      {
        id: "1",
        label: "A",
        total: 50000,
        lines: [
          { description: "Evaporator", quantity: 2, unitPrice: 20000 },
          { description: "Labor", quantity: 1, unitPrice: 10000 },
        ],
      },
    ],
    scope: "Replace filter and capillary, recharge gas",
  });
  assert.deepEqual(checks.scopeGaps, [
    'Scope references "filter/drier" but no priced line item was found.',
    'Scope references "capillary" but no priced line item was found.',
    'Scope references "refrigerant/gas" but no priced line item was found.',
  ]);
});

test("scope with no keywords produces no gaps", () => {
  const checks = estimateChecks({
    options: [
      {
        id: "1",
        label: "A",
        total: 50000,
        lines: [{ description: "General service", quantity: 1, unitPrice: 50000 }],
      },
    ],
    scope: "Perform general service on unit",
  });
  assert.deepEqual(checks.scopeGaps, []);
});

test("scope keywords matched by line items produce no gaps", () => {
  const checks = estimateChecks({
    options: [
      {
        id: "1",
        label: "A",
        total: 80000,
        lines: [
          { description: "Replace evaporator coil", quantity: 1, unitPrice: 30000 },
          { description: "Install filter drier", quantity: 1, unitPrice: 10000 },
          { description: "Recharge R-410A refrigerant", quantity: 2, unitPrice: 15000 },
        ],
      },
    ],
    scope: "Replace evaporator, install filter, recharge gas, leak test",
  });
  assert.deepEqual(checks.scopeGaps, [
    'Scope references "leak test" but no priced line item was found.',
    'Scope references "operational test" but no priced line item was found.',
  ]);
});

test("scope uses job description as fallback", () => {
  const checks = estimateChecks({
    options: [
      { id: "1", label: "A", total: 20000, lines: [{ description: "Thermostat", quantity: 1, unitPrice: 20000 }] },
    ],
    jobDescription: "Client reports compressor not starting",
  });
  assert.deepEqual(checks.scopeGaps, ['Scope references "compressor" but no priced line item was found.']);
});

test("identical options across three options with different units are not identical", () => {
  const options = [
    { id: "1", label: "A", total: 40000, lines: [{ description: "Evaporator", quantity: 2, unitPrice: 20000, unit: "pcs" }] },
    { id: "2", label: "B", total: 40000, lines: [{ description: "Evaporator", quantity: 2, unitPrice: 20000, unit: "kg" }] },
  ];
  assert.equal(optionsIdentical(options), false);
});

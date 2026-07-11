import assert from "node:assert/strict";
import test from "node:test";
import { validateInvoiceCreation } from "../src/invoice-creation.js";

test("zero-value jobs cannot produce invoices", () => {
  assert.deepEqual(validateInvoiceCreation(0), {
    statusCode: 400,
    body: {
      error: "job has no billable total",
      hint: "Add at least one billable line item before creating an invoice.",
    },
  });
});

test("an active invoice blocks a duplicate", () => {
  assert.deepEqual(
    validateInvoiceCreation(25_000, { id: "inv-1", number: "INV-1001", status: "sent" }),
    {
      statusCode: 409,
      body: {
        error: "job already has an active invoice",
        invoice: { id: "inv-1", number: "INV-1001", status: "sent" },
      },
    },
  );
});

test("a priced job without an active invoice is eligible", () => {
  assert.equal(validateInvoiceCreation(25_000), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatDispatchApiError } from "./dispatch-api";

test("formats a structured scheduling conflict for dispatchers", () => {
  const message = formatDispatchApiError(
    409,
    "Conflict",
    JSON.stringify({
      error: "technician has an overlapping appointment",
      conflict: {
        startsAt: "2026-07-11T14:00:00.000Z",
        endsAt: "2026-07-11T15:00:00.000Z",
      },
    }),
  );

  assert.match(message, /^technician has an overlapping appointment \(.+–.+\)$/);
  assert.doesNotMatch(message, /appointmentId|startsAt|endsAt/);
});

test("uses a normal JSON error message without exposing the response envelope", () => {
  assert.equal(
    formatDispatchApiError(400, "Bad Request", JSON.stringify({ error: "technician is inactive" })),
    "technician is inactive",
  );
});

test("preserves status context for non-JSON and empty responses", () => {
  assert.equal(formatDispatchApiError(500, "Internal Server Error", "gateway unavailable"), "500: gateway unavailable");
  assert.equal(formatDispatchApiError(503, "Service Unavailable", ""), "503: Service Unavailable");
});

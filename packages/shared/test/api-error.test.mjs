import assert from "node:assert/strict";
import test from "node:test";
import { apiErrorMessage } from "../src/api-error.ts";

test("apiErrorMessage surfaces the backend message, not the whole object", () => {
  const body = JSON.stringify({ message: "Invalid phone or code.", error: "Unauthorized", statusCode: 401 });
  assert.equal(apiErrorMessage(401, body), "Invalid phone or code.");
});

test("apiErrorMessage falls back to the error field when no message", () => {
  const body = JSON.stringify({ error: "Forbidden", statusCode: 403 });
  assert.equal(apiErrorMessage(403, body), "Forbidden");
});

test("apiErrorMessage strips a status-number prefix from the body", () => {
  const body = `401: ${JSON.stringify({ message: "Invalid phone or code." })}`;
  assert.equal(apiErrorMessage(401, body), "Invalid phone or code.");
});

test("apiErrorMessage returns plain text as-is", () => {
  assert.equal(apiErrorMessage(500, "upstream went away"), "upstream went away");
});

test("apiErrorMessage maps unknown empty bodies to friendly fallbacks", () => {
  assert.equal(apiErrorMessage(404, ""), "That item could not be found. It may have been removed.");
  assert.equal(apiErrorMessage(429, "{}"), "Too many requests. Please wait a moment and try again.");
  assert.equal(apiErrorMessage(503, ""), "The server hit an unexpected error. Please try again in a moment.");
  assert.equal(apiErrorMessage(0, " "), "The request failed. Please try again.");
});
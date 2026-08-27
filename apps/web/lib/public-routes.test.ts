import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./public-routes.js";

test("isPublicPath accepts login and portal surfaces", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/welcome"), true);
  assert.equal(isPublicPath("/portal/customer-1"), true);
  assert.equal(isPublicPath("/p/pl_token"), true);
  assert.equal(isPublicPath("/jobs"), false);
  assert.equal(isPublicPath(null), false);
  assert.equal(isPublicPath(undefined), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
  sessionTokenFromCookie,
} from "../src/session-cookie.js";

test("session cookie is HTTP-only, same-site, scoped, and secure in production", () => {
  const header = sessionCookieHeader("header.payload.signature", {
    maxAgeSeconds: 3600,
    env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
  });
  assert.match(header, /^NNPsession=/);
  assert.match(header, /Path=\//);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Secure/);
  assert.match(header, /Max-Age=3600/);
  assert.equal(sessionTokenFromCookie(header), "header.payload.signature");
});

test("development session cookie omits Secure for local HTTP", () => {
  const header = sessionCookieHeader("token", {
    env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
  });
  assert.doesNotMatch(header, /; Secure/);
  assert.equal(sessionTokenFromCookie(`other=value; ${header}`), "token");
});

test("logout cookie expires the same session name and path", () => {
  const header = clearSessionCookieHeader({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.match(header, /^NNPsession=/);
  assert.match(header, /Max-Age=0/);
  assert.match(header, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.match(header, /Path=\//);
  assert.match(header, /Secure/);
});

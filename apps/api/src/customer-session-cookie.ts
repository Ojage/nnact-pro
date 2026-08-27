import type { FastifyReply, FastifyRequest } from "fastify";
import { sessionTokenFromCookie } from "./session-cookie.js";

export const CUSTOMER_SESSION_COOKIE_NAME = "NNPcustomerSession";

function parseCookieHeader(header: string | undefined) {
  const values = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      values.set(name, decodeURIComponent(rawValue));
    } catch {
      continue;
    }
  }
  return values;
}

export function customerSessionTokenFromCookie(header: string | undefined) {
  return parseCookieHeader(header).get(CUSTOMER_SESSION_COOKIE_NAME) ?? null;
}

function cookieAttributes(env: NodeJS.ProcessEnv = process.env) {
  return ["Path=/", "HttpOnly", "SameSite=Lax", ...(env.NODE_ENV === "production" ? ["Secure"] : [])];
}

export function customerSessionCookieHeader(token: string, maxAgeSeconds = 15 * 60) {
  return [
    `${CUSTOMER_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...cookieAttributes(),
    `Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}`,
  ].join("; ");
}

export function clearCustomerSessionCookieHeader(env: NodeJS.ProcessEnv = process.env) {
  return [
    `${CUSTOMER_SESSION_COOKIE_NAME}=`,
    ...cookieAttributes(env),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export function setCustomerSessionCookie(reply: FastifyReply, token: string) {
  reply.header("Set-Cookie", customerSessionCookieHeader(token));
}

export function clearCustomerSessionCookie(reply: FastifyReply) {
  reply.header("Set-Cookie", clearCustomerSessionCookieHeader());
}

export async function unifiedSessionCookieAuthenticationHook(request: FastifyRequest) {
  if (request.headers.authorization) return;
  const path = new URL(request.url, "http://api.internal").pathname;
  if (path.startsWith("/api/customer-auth")) {
    const publicPaths = ["/api/customer-auth/register", "/api/customer-auth/login", "/api/customer-auth/refresh"];
    if (!publicPaths.includes(path)) {
      const token = customerSessionTokenFromCookie(request.headers.cookie);
      if (token) request.headers.authorization = `Bearer ${token}`;
    }
    return;
  }
  const token = sessionTokenFromCookie(request.headers.cookie);
  if (token) request.headers.authorization = `Bearer ${token}`;
}

import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE_NAME = "ofp_session";
const DEFAULT_MAX_AGE_SECONDS = 12 * 60 * 60;

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

export function sessionTokenFromCookie(header: string | undefined) {
  return parseCookieHeader(header).get(SESSION_COOKIE_NAME) ?? null;
}

function cookieAttributes(env: NodeJS.ProcessEnv = process.env) {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(env.NODE_ENV === "production" ? ["Secure"] : []),
  ];
}

export function sessionCookieHeader(
  token: string,
  options: { maxAgeSeconds?: number; env?: NodeJS.ProcessEnv } = {},
) {
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    ...cookieAttributes(options.env),
    `Max-Age=${Math.max(1, Math.floor(maxAge))}`,
  ].join("; ");
}

export function clearSessionCookieHeader(env: NodeJS.ProcessEnv = process.env) {
  return [
    `${SESSION_COOKIE_NAME}=`,
    ...cookieAttributes(env),
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export async function sessionCookieAuthenticationHook(request: FastifyRequest) {
  if (request.headers.authorization) return;
  const token = sessionTokenFromCookie(request.headers.cookie);
  if (token) request.headers.authorization = `Bearer ${token}`;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.header("Set-Cookie", sessionCookieHeader(token));
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.header("Set-Cookie", clearSessionCookieHeader());
}

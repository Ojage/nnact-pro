import type { FastifyReply } from "fastify";

export function applyApiSecurityHeaders(reply: FastifyReply, production = process.env.NODE_ENV === "production") {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  reply.header("Cross-Origin-Resource-Policy", "same-site");
  if (production) {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

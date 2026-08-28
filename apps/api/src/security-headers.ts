import type { FastifyReply } from "fastify";

export function applyApiSecurityHeaders(reply: FastifyReply, production = process.env.NODE_ENV === "production") {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Base restrictive CSP; /docs route will relax via onSend hook in server.ts
  reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

  reply.header("Cross-Origin-Resource-Policy", "same-site");
  if (production) {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function applyDocsSecurityHeaders(reply: FastifyReply) {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Allow self-hosted Swagger UI assets (scripts, styles, images, fonts)
  reply.header(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self' data:; " +
      "frame-ancestors 'none'; " +
      "base-uri 'none';",
  );
  reply.header("Cross-Origin-Resource-Policy", "same-site");
}

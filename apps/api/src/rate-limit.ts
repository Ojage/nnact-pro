import type { FastifyReply, FastifyRequest } from "fastify";

interface WindowState {
  count: number;
  resetAt: number;
}

export interface FixedWindowLimiterOptions {
  max: number;
  windowMs: number;
  key: (request: FastifyRequest) => string;
  now?: () => number;
  maxKeys?: number;
}

export function createFixedWindowRateLimit(options: FixedWindowLimiterOptions) {
  if (!Number.isInteger(options.max) || options.max <= 0) throw new Error("rate limit max must be positive");
  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) throw new Error("rate limit windowMs must be positive");

  const windows = new Map<string, WindowState>();
  const clock = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;

  function prune(now: number) {
    for (const [key, state] of windows) {
      if (state.resetAt <= now) windows.delete(key);
    }
    while (windows.size > maxKeys) {
      const oldest = windows.keys().next().value as string | undefined;
      if (!oldest) break;
      windows.delete(oldest);
    }
  }

  return async function rateLimit(request: FastifyRequest, reply: FastifyReply) {
    const now = clock();
    if (windows.size >= maxKeys) prune(now);

    const key = options.key(request);
    const current = windows.get(key);
    const state = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current;
    state.count += 1;
    windows.set(key, state);

    const remaining = Math.max(0, options.max - state.count);
    reply.header("X-RateLimit-Limit", String(options.max));
    reply.header("X-RateLimit-Remaining", String(remaining));
    reply.header("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

    if (state.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
      reply.header("Retry-After", String(retryAfter));
      return reply.code(429).send({ error: "too many requests", retryAfterSeconds: retryAfter });
    }
  };
}

export function requestIpKey(request: FastifyRequest) {
  return request.ip || "unknown";
}

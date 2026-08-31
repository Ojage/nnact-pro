// Repair Brain Redis backing layer.
//
// Redis is optional in this monorepo: it's provisioned in infra/compose.yml but
// is not a hard runtime dependency. Every operation here degrades gracefully to
// a no-op (or uncached) path when `REDIS_URL` is absent or the server is down,
// so the API keeps working with zero configuration. A flaky cache must never
// break a user-visible request — all helpers swallow errors and never throw.
//
// Used today for: response caching (search/profile/insights), trending counters,
// and typeahead suggestions.

import { Redis } from "ioredis";

type RedisClient = Redis;

let client: RedisClient | null = null;
let enabled = false;
let connectionAttempted = false;

const DEFAULT_TTL_SECONDS = 300;

function rawClient(): RedisClient | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (enabled && client) return client;
  if (connectionAttempted) return null;
  connectionAttempted = true;
  try {
    client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      enableOfflineQueue: false,
    });
    client.on("error", () => {
      // Silence Error: connect ECONNREFUSED — fall back to uncached behavior.
    });
    client.connect().catch(() => {
      enabled = false;
      client = null;
    });
    enabled = true;
    return client;
  } catch {
    return null;
  }
}

/** True when Redis is configured and connected (or optimistically connecting). */
export function redisAvailable(): boolean {
  return enabled;
}

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const c = rawClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJSON(
  key: string,
  value: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const c = rawClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* no-op */
  }
}

export async function cacheDelete(...keys: string[]): Promise<void> {
  const c = rawClient();
  if (!c || keys.length === 0) return;
  try {
    if (keys.length === 1) await c.del(keys[0]);
    else await c.del(...keys);
  } catch {
    /* no-op */
  }
}

/**
 * Delete every key sharing a prefix, e.g. `rb:org:{orgId}:search:*`.
 * Pass an orgId to scope invalidation, or "*" to clear across orgs.
 */
export async function invalidateByPrefix(prefix: string): Promise<void> {
  const c = rawClient();
  if (!c) return;
  try {
    const stream = c.scanStream({ match: `${prefix}*`, count: 200 });
    let batch: string[] = [];
    for await (const keys of stream) {
      batch = batch.concat(keys);
      if (batch.length >= 200) {
        await c.del(...batch);
        batch = [];
      }
    }
    if (batch.length) await c.del(...batch);
  } catch {
    /* no-op */
  }
}

// ── Trending counters ──────────────────────────────────────────────
// A given counter is stored in a sorted set keyed by the scope; members are
// ids and scores are usage counts. `trendingTop` returns them in descending
// order.

export async function counterIncr(
  scope: string,
  member: string,
  by = 1,
): Promise<void> {
  const c = rawClient();
  if (!c) return;
  try {
    await c.zincrby(scope, by, member);
  } catch {
    /* no-op */
  }
}

export async function counterTop(
  scope: string,
  limit = 10,
): Promise<Array<{ id: string; score: number }>> {
  const c = rawClient();
  if (!c) return [];
  try {
    const list = await c.zrevrange(scope, 0, limit - 1, "WITHSCORES");
    const out: Array<{ id: string; score: number }> = [];
    for (let i = 0; i < list.length; i += 2) {
      out.push({ id: list[i], score: Number(list[i + 1]) });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Typeahead suggestions ──────────────────────────────────────────
// Each suggestion lives in a per-org sorted set; member is the text, score is
// popularity. `suggestLookup` returns the highest-popularity members with a
// given prefix.

export async function suggestAdd(
  orgId: string,
  kind: string,
  text: string,
): Promise<void> {
  const c = rawClient();
  if (!c) return;
  try {
    const key = `rb:suggest:${orgId}:${kind}`;
    await c.zincrby(key, 1, text.toLowerCase());
  } catch {
    /* no-op */
  }
}

export async function suggestLookup(
  orgId: string,
  kind: string,
  prefix: string,
  limit = 8,
): Promise<string[]> {
  const c = rawClient();
  if (!c) return [];
  try {
    const key = `rb:suggest:${orgId}:${kind}`;
    const all = await c.zrevrange(key, 0, -1, "WITHSCORES");
    const matches: string[] = [];
    for (let i = 0; i < all.length; i += 2) {
      const member = all[i];
      if (member.startsWith(prefix.toLowerCase())) {
        matches.push(member);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  } catch {
    return [];
  }
}

/** Close the shared client (called on app shutdown). */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    /* no-op */
  } finally {
    client = null;
    enabled = false;
    connectionAttempted = false;
  }
}

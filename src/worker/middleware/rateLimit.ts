import type { MiddlewareHandler, Context } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../types";

// Soft, in-memory rate limiting (spec sections 39–40). Per-isolate only —
// this is basic abuse protection, NOT a security boundary or a global limiter.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(c: Context): string {
  return (
    getCookie(c, "workspace_session") ??
    c.env?.CLIENT_IP ??
    "anon"
  );
}

interface RateLimitOptions {
  scope: string;
  limit: number;
  windowMs: number;
  by?: (c: Context) => string;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = opts.by ? opts.by(c) : clientKey(c);
    const key = `${opts.scope}:${id}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    if (bucket.count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return c.json({ error: "Too Many Requests" }, 429, {
        "Retry-After": String(retryAfter),
      });
    }

    if (buckets.size > 5000) sweep(now);
    await next();
  };
}

/** Method-aware limiter for the authenticated workspace API (spec section 39). */
export function workspaceRateLimit(): MiddlewareHandler<AppEnv> {
  const read = rateLimit({ scope: "ws-read", limit: 300, windowMs: 60_000 });
  const write = rateLimit({ scope: "ws-write", limit: 60, windowMs: 60_000 });
  return (c, next) => (c.req.method === "GET" || c.req.method === "HEAD" ? read(c, next) : write(c, next));
}

function sweep(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

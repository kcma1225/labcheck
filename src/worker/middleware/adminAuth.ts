import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, Env } from "../types";
import { safeEqualStr, verifySignedToken } from "../lib/crypto";
import { HttpError } from "../lib/response";

// Admin has no account — only ADMIN_SECRET (spec sections 9–10). After a first
// login with the secret, a stateless HMAC-signed cookie stands in for it so the
// secret isn't re-entered on every action. No admin table is added.

export const ADMIN_COOKIE = "admin_session";

interface AdminTokenPayload {
  role: "admin";
  exp: number;
}

/** Verify a raw secret (used only by POST /api/admin/login). */
export function assertAdminSecret(env: Env, provided: unknown): void {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    console.error("ADMIN_SECRET is not configured");
    throw new HttpError(401, "Unauthorized");
  }
  if (typeof provided !== "string" || provided.length === 0 || !safeEqualStr(provided, secret)) {
    throw new HttpError(401, "Unauthorized");
  }
}

export async function isAdmin(c: Context<AppEnv>): Promise<boolean> {
  if (!c.env.ADMIN_SECRET) return false;
  const cookie = getCookie(c, ADMIN_COOKIE);
  if (cookie) {
    const payload = await verifySignedToken<AdminTokenPayload>(c.env.ADMIN_SECRET, cookie);
    if (payload?.role === "admin" && typeof payload.exp === "number" && payload.exp > Date.now()) {
      return true;
    }
  }
  // Header fallback so scripts / curl still work without a login round-trip.
  const header = c.req.header("x-admin-secret");
  if (header && c.env.ADMIN_SECRET && safeEqualStr(header, c.env.ADMIN_SECRET)) return true;
  return false;
}

/** Gate for every admin route except login/logout/session. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await isAdmin(c))) return c.json({ error: "Unauthorized" }, 401);
  await next();
};

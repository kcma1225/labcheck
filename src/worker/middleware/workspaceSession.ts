import type { MiddlewareHandler } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { sha256Hex } from "../lib/crypto";
import { getSession, deleteSession } from "../db/queries/sessions";

export const SESSION_COOKIE = "workspace_session";

// Guards every /api/workspaces/:id/* route (spec section 34).
export const workspaceSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  const sessionId = await sha256Hex(token);
  const session = await getSession(c.env.DB, sessionId);
  if (!session) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (session.expires_at <= Date.now()) {
    await deleteSession(c.env.DB, sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Session is bound to one workspace (spec section 34).
  if (session.workspace_id !== c.req.param("id")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  c.set("workspaceId", session.workspace_id);
  c.set("sessionId", sessionId);
  await next();
};

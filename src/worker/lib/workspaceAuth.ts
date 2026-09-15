import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { SESSION_TTL_MS } from "../types";
import { SESSION_COOKIE } from "../middleware/workspaceSession";
import { newSessionToken, sha256Hex } from "./crypto";
import { cookieSecure } from "./http";
import { createSession } from "../db/queries/sessions";

/**
 * Issues a workspace session cookie — the one thing every login path (the
 * password unlock and the passkey login) must do identically.
 */
export async function issueWorkspaceSession(c: Context<AppEnv>, workspaceId: string): Promise<void> {
  const token = newSessionToken();
  const now = Date.now();
  await createSession(c.env.DB, {
    id: await sha256Hex(token),
    workspace_id: workspaceId,
    expires_at: now + SESSION_TTL_MS,
    created_at: now,
  });

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

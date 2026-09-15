import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { SESSION_COOKIE } from "../middleware/workspaceSession";
import { str, password as validatePassword } from "../middleware/validation";
import { verifyPassword } from "../lib/crypto";
import { issueWorkspaceSession } from "../lib/workspaceAuth";
import { getWorkspace, listWorkspaces, renameWorkspace } from "../db/queries/workspaces";
import { deleteSession } from "../db/queries/sessions";

/**
 * GET /api/workspaces (public — deliberately no auth). Lets the Home page
 * show an open-link directory of every workspace. Names/ids are not
 * sensitive by themselves; the workspace password is still required to
 * unlock any of them.
 */
export async function listWorkspacesHandler(c: Context<AppEnv>): Promise<Response> {
  const workspaces = await listWorkspaces(c.env.DB);
  return c.json({ workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })) });
}

// A valid PBKDF2 string used to equalise timing when the workspace is unknown.
const DUMMY_HASH =
  "pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * POST /api/workspaces/:id/unlock  (public — spec sections 12–15).
 * Verifies the workspace password server-side and issues a session cookie.
 */
export async function unlockHandler(c: Context<AppEnv>): Promise<Response> {
  const id = c.req.param("id")!;
  const body = await readJson(c.req.raw);
  const password = validatePassword(body.password);

  const ws = await getWorkspace(c.env.DB, id);
  const ok = ws
    ? await verifyPassword(password, ws.password_hash)
    : (await verifyPassword(password, DUMMY_HASH), false);

  if (!ok || !ws) return c.json({ error: "Invalid password" }, 401);

  await issueWorkspaceSession(c, id);

  return c.json({ workspace: { id: ws.id, name: ws.name } });
}

// Authenticated workspace routes, mounted at /api/workspaces/:id
const workspace = new Hono<AppEnv>();

/** GET /api/workspaces/:id — used by the frontend to check the session. */
workspace.get("/", async (c) => {
  const ws = await getWorkspace(c.env.DB, c.get("workspaceId"));
  if (!ws) return c.json({ error: "Not Found" }, 404);
  return c.json({
    workspace: {
      id: ws.id,
      name: ws.name,
      created_at: ws.created_at,
      updated_at: ws.updated_at,
    },
  });
});

/** PATCH /api/workspaces/:id — rename. */
workspace.patch("/", async (c) => {
  const body = await readJson(c.req.raw);
  const name = str(body.name, 1, 100, "Workspace name");
  await renameWorkspace(c.env.DB, c.get("workspaceId"), name);
  return c.json({ ok: true, name });
});

/** POST /api/workspaces/:id/lock — end the current session (logout). */
workspace.post("/lock", async (c) => {
  await deleteSession(c.env.DB, c.get("sessionId"));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export default workspace;

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import {
  ADMIN_COOKIE,
  assertAdminSecret,
  isAdmin,
  requireAdmin,
} from "../middleware/adminAuth";
import { str, password } from "../middleware/validation";
import { randomId, hashPassword, createSignedToken } from "../lib/crypto";
import { cookieSecure, readJson } from "../lib/http";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  renameWorkspace,
  setWorkspacePassword,
} from "../db/queries/workspaces";

// Admin API (spec sections 10, 37).
const admin = new Hono<AppEnv>();

const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** POST /api/admin/login — exchange the admin secret for a session cookie. */
admin.post("/login", async (c) => {
  const body = c.req.raw.body === null ? {} : await readJson(c.req.raw);
  assertAdminSecret(c.env, body.adminSecret ?? c.req.header("x-admin-secret"));

  const token = await createSignedToken(c.env.ADMIN_SECRET, {
    role: "admin",
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  });
  setCookie(c, ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
  return c.json({ ok: true });
});

admin.post("/logout", (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/** GET /api/admin/session — lets the admin page know if it's already unlocked. */
admin.get("/session", async (c) => {
  return c.json({ authenticated: await isAdmin(c) });
});

// --- everything below requires an admin session --------------------------
admin.use("/workspaces", requireAdmin);
admin.use("/workspaces/*", requireAdmin);

/** GET /api/admin/workspaces — list all workspaces so the admin can manage them. */
admin.get("/workspaces", async (c) => {
  return c.json({ workspaces: await listWorkspaces(c.env.DB) });
});

/** POST /api/admin/workspaces — create a workspace, return its URL. */
admin.post("/workspaces", async (c) => {
  const body = await readJson(c.req.raw);
  const name = str(body.name, 1, 100, "Workspace name");
  const pw = password(body.password, "Workspace password");

  const id = randomId(24);
  const now = Date.now();
  await createWorkspace(c.env.DB, {
    id,
    name,
    password_hash: await hashPassword(pw),
    created_at: now,
  });

  const origin = c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin;
  return c.json({ id, name, created_at: now, url: `${origin}/w/${id}` }, 201);
});

/** PATCH /api/admin/workspaces/:id — rename a workspace. */
admin.patch("/workspaces/:id", async (c) => {
  const id = c.req.param("id");
  const ws = await getWorkspace(c.env.DB, id);
  if (!ws) return c.json({ error: "Not Found" }, 404);

  const body = await readJson(c.req.raw);
  const name = str(body.name, 1, 100, "Workspace name");
  await renameWorkspace(c.env.DB, id, name);
  return c.json({ ok: true, name });
});

/** PATCH /api/admin/workspaces/:id/password — rotate the workspace password. */
admin.patch("/workspaces/:id/password", async (c) => {
  const id = c.req.param("id");
  const ws = await getWorkspace(c.env.DB, id);
  if (!ws) return c.json({ error: "Not Found" }, 404);

  const body = await readJson(c.req.raw);
  await setWorkspacePassword(c.env.DB, id, await hashPassword(password(body.password, "Workspace password")));
  return c.json({ ok: true });
});

/** DELETE /api/admin/workspaces/:id — remove a workspace and all its data. */
admin.delete("/workspaces/:id", async (c) => {
  const id = c.req.param("id");
  const ws = await getWorkspace(c.env.DB, id);
  if (!ws) return c.json({ error: "Not Found" }, 404);

  await deleteWorkspace(c.env.DB, id);
  return c.json({ ok: true });
});

export default admin;

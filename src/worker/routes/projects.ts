import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, optionalStr, optionalColor, optionalId } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { assertGroup } from "../db/queries/groups";
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
} from "../db/queries/projects";

const projects = new Hono<AppEnv>();

projects.get("/", async (c) => {
  return c.json({ projects: await listProjects(c.env.DB, c.get("workspaceId")) });
});

/** POST /api/workspaces/:id/projects — add a tab (a course, a thesis, ...). */
projects.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const now = Date.now();
  const groupId = optionalId(body.group_id, "group_id");
  await assertGroup(c.env.DB, c.get("workspaceId"), groupId);
  const row = {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    name: str(body.name, 1, 100, "Project name"),
    description: optionalStr(body.description, 5000, "Description"),
    group_id: groupId,
    color: optionalColor(body.color, "color"),
    sort_order: now,
    created_at: now,
  };
  await createProject(c.env.DB, row);
  return c.json({ project: { ...row, updated_at: null } }, 201);
});

/** POST /reorder — full new order for all of the workspace's tabs. */
projects.post("/reorder", async (c) => {
  const body = await readJson(c.req.raw);
  if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) {
    return c.json({ error: "ids must be an array of strings" }, 400);
  }
  await reorderProjects(c.env.DB, c.get("workspaceId"), body.ids as string[]);
  return c.json({ ok: true });
});

projects.get("/:projectId", async (c) => {
  const p = await getProject(c.env.DB, c.get("workspaceId"), c.req.param("projectId"));
  if (!p) return c.json({ error: "Not Found" }, 404);
  return c.json({ project: p });
});

projects.patch("/:projectId", async (c) => {
  const body = await readJson(c.req.raw);
  const groupId = body.group_id === undefined ? undefined : optionalId(body.group_id, "group_id");
  if (groupId !== undefined) await assertGroup(c.env.DB, c.get("workspaceId"), groupId);
  const fields = {
    name: body.name === undefined ? undefined : str(body.name, 1, 100, "Project name"),
    description:
      body.description === undefined ? undefined : optionalStr(body.description, 5000, "Description"),
    group_id: groupId,
    color: body.color === undefined ? undefined : optionalColor(body.color, "color"),
  };
  const ok = await updateProject(c.env.DB, c.get("workspaceId"), c.req.param("projectId"), fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

projects.delete("/:projectId", async (c) => {
  const ok = await deleteProject(c.env.DB, c.get("workspaceId"), c.req.param("projectId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default projects;

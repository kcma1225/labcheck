import { assertProject } from "../db/queries/projects";
import { assertResource } from "../db/queries/resources";
import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, optionalStr, oneOf, optionalInt, optionalId, csv } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { listTasks, createTask, updateTask, deleteTask } from "../db/queries/tasks";

const STATUSES = ["todo", "doing", "done"] as const;

const tasks = new Hono<AppEnv>();

/** GET /api/workspaces/:id/tasks?status=todo,doing&projectId=... */
tasks.get("/", async (c) => {
  const status = csv(c.req.query("status"))?.filter((s) =>
    (STATUSES as readonly string[]).includes(s),
  );
  const rows = await listTasks(c.env.DB, c.get("workspaceId"), {
    status,
    projectId: c.req.query("projectId") ?? null,
  });
  return c.json({ tasks: rows });
});

tasks.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const now = Date.now();
  const row = {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    project_id: optionalId(body.project_id, "project_id"),
    title: str(body.title, 1, 200, "Task title"),
    description: optionalStr(body.description, 5000, "Description"),
    status: body.status === undefined ? "todo" : oneOf(body.status, STATUSES, "status"),
    due_date: optionalInt(body.due_date, "due_date"),
    assignee_name: optionalStr(body.assignee_name, 100, "Assignee name"),
    resource_id: optionalId(body.resource_id, "resource_id"),
    created_at: now,
  };
  await assertProject(c.env.DB, row.workspace_id, row.project_id);
  await assertResource(c.env.DB, row.workspace_id, row.resource_id);
  await createTask(c.env.DB, row);
  return c.json({ task: { ...row, updated_at: null } }, 201);
});

tasks.patch("/:taskId", async (c) => {
  const body = await readJson(c.req.raw);
  const fields = {
    title: body.title === undefined ? undefined : str(body.title, 1, 200, "Task title"),
    description:
      body.description === undefined ? undefined : optionalStr(body.description, 5000, "Description"),
    status: body.status === undefined ? undefined : oneOf(body.status, STATUSES, "status"),
    due_date: body.due_date === undefined ? undefined : optionalInt(body.due_date, "due_date"),
    assignee_name:
      body.assignee_name === undefined ? undefined : optionalStr(body.assignee_name, 100, "Assignee name"),
    project_id: body.project_id === undefined ? undefined : optionalId(body.project_id, "project_id"),
    resource_id: body.resource_id === undefined ? undefined : optionalId(body.resource_id, "resource_id"),
  };
  await assertProject(c.env.DB, c.get("workspaceId"), fields.project_id);
  await assertResource(c.env.DB, c.get("workspaceId"), fields.resource_id);
  const ok = await updateTask(c.env.DB, c.get("workspaceId"), c.req.param("taskId"), fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

tasks.delete("/:taskId", async (c) => {
  const ok = await deleteTask(c.env.DB, c.get("workspaceId"), c.req.param("taskId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default tasks;

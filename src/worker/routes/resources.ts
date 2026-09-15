import { assertProject } from "../db/queries/projects";
import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, optionalStr, optionalId, requiredInt } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { listResources, getResource, createResource, deleteResource } from "../db/queries/resources";
import {
  listMarks,
  createMark,
  updateMark,
  deleteMark,
  deleteMarksForResource,
} from "../db/queries/resourceMarks";

// Resource metadata: URL bookmarks live here directly; uploaded files are
// created via ./files.ts and also listed/deleted here (spec sections 27–28, 36).
const resources = new Hono<AppEnv>();

resources.get("/", async (c) => {
  const rows = await listResources(c.env.DB, c.get("workspaceId"), c.req.query("projectId") ?? null);
  return c.json({ resources: rows });
});

/** POST /api/workspaces/:id/resources — add a URL resource. */
resources.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const now = Date.now();
  const row = {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    project_id: optionalId(body.project_id, "project_id"),
    name: str(body.name, 1, 200, "Name"),
    type: "url",
    url: str(body.url, 1, 2000, "URL"),
    storage_key: null,
    mime_type: null,
    file_size: null,
    created_at: now,
  };
  await assertProject(c.env.DB, row.workspace_id, row.project_id);
  await createResource(c.env.DB, row);
  return c.json({ resource: row }, 201);
});

/** DELETE /api/workspaces/:id/resources/:resourceId — also removes the stored file and its page marks. */
resources.delete("/:resourceId", async (c) => {
  const r = await getResource(c.env.DB, c.get("workspaceId"), c.req.param("resourceId"));
  if (!r) return c.json({ error: "Not Found" }, 404);
  if (r.storage_key) await c.env.BUCKET.delete(r.storage_key);
  await deleteMarksForResource(c.env.DB, c.get("workspaceId"), r.id);
  await deleteResource(c.env.DB, c.get("workspaceId"), r.id);
  return c.json({ ok: true });
});

// --- Shared page marks/notes on a PDF resource --------------------------

resources.get("/:resourceId/marks", async (c) => {
  const marks = await listMarks(c.env.DB, c.get("workspaceId"), c.req.param("resourceId"));
  return c.json({ marks });
});

resources.post("/:resourceId/marks", async (c) => {
  const workspaceId = c.get("workspaceId");
  const resourceId = c.req.param("resourceId");
  const resource = await getResource(c.env.DB, workspaceId, resourceId);
  if (!resource) return c.json({ error: "Not Found" }, 404);

  const body = await readJson(c.req.raw);
  const pageNumber = requiredInt(body.page_number, "page_number");
  if (pageNumber < 1) return c.json({ error: "page_number must be at least 1" }, 400);
  const row = {
    id: randomId(16),
    workspace_id: workspaceId,
    resource_id: resourceId,
    page_number: pageNumber,
    note: optionalStr(body.note, 5000, "Note"),
    created_at: Date.now(),
  };
  await createMark(c.env.DB, row);
  return c.json({ mark: { ...row, updated_at: null } }, 201);
});

resources.patch("/:resourceId/marks/:markId", async (c) => {
  const body = await readJson(c.req.raw);
  const fields = {
    note: body.note === undefined ? undefined : optionalStr(body.note, 5000, "Note"),
  };
  const ok = await updateMark(c.env.DB, c.get("workspaceId"), c.req.param("markId"), fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

resources.delete("/:resourceId/marks/:markId", async (c) => {
  const ok = await deleteMark(c.env.DB, c.get("workspaceId"), c.req.param("markId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default resources;

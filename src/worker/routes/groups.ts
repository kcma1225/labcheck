import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, optionalColor } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  assertGroupNameAvailable,
} from "../db/queries/groups";

const groups = new Hono<AppEnv>();

groups.get("/", async (c) => {
  return c.json({ groups: await listGroups(c.env.DB, c.get("workspaceId")) });
});

groups.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const workspaceId = c.get("workspaceId");
  const name = str(body.name, 1, 100, "Group name");
  await assertGroupNameAvailable(c.env.DB, workspaceId, name);
  const row = {
    id: randomId(16),
    workspace_id: workspaceId,
    name,
    color: optionalColor(body.color, "color"),
    sort_order: Date.now(),
    created_at: Date.now(),
  };
  await createGroup(c.env.DB, row);
  return c.json({ group: { ...row, updated_at: null } }, 201);
});

/** POST /reorder — full new order for all of the workspace's groups. */
groups.post("/reorder", async (c) => {
  const body = await readJson(c.req.raw);
  if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) {
    return c.json({ error: "ids must be an array of strings" }, 400);
  }
  await reorderGroups(c.env.DB, c.get("workspaceId"), body.ids as string[]);
  return c.json({ ok: true });
});

groups.patch("/:groupId", async (c) => {
  const body = await readJson(c.req.raw);
  const workspaceId = c.get("workspaceId");
  const groupId = c.req.param("groupId");
  const fields = {
    name: body.name === undefined ? undefined : str(body.name, 1, 100, "Group name"),
    color: body.color === undefined ? undefined : optionalColor(body.color, "color"),
  };
  if (fields.name !== undefined) {
    await assertGroupNameAvailable(c.env.DB, workspaceId, fields.name, groupId);
  }
  const ok = await updateGroup(c.env.DB, workspaceId, groupId, fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

groups.delete("/:groupId", async (c) => {
  const ok = await deleteGroup(c.env.DB, c.get("workspaceId"), c.req.param("groupId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default groups;

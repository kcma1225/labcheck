import { buildUpdate } from "./_util";
import { HttpError, ValidationError } from "../../lib/response";

export interface GroupRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number | null;
}

export async function listGroups(db: import("../../types").Database, workspaceId: string): Promise<GroupRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM groups WHERE workspace_id = ? ORDER BY sort_order, name")
    .bind(workspaceId)
    .all<GroupRow>();
  return results ?? [];
}

export async function getGroup(db: import("../../types").Database, workspaceId: string, id: string): Promise<GroupRow | null> {
  return db
    .prepare("SELECT * FROM groups WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .first<GroupRow>();
}

export async function assertGroup(
  db: import("../../types").Database, workspaceId: string, groupId: string | null | undefined,
): Promise<void> {
  if (groupId && !(await getGroup(db, workspaceId, groupId))) {
    throw new ValidationError("Group does not belong to this workspace");
  }
}

/** Group names must be unique per workspace (case-insensitive); tab names may repeat. */
export async function assertGroupNameAvailable(
  db: import("../../types").Database,
  workspaceId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db
    .prepare(
      excludeId
        ? "SELECT id FROM groups WHERE workspace_id = ? AND LOWER(name) = LOWER(?) AND id != ?"
        : "SELECT id FROM groups WHERE workspace_id = ? AND LOWER(name) = LOWER(?)",
    )
    .bind(...(excludeId ? [workspaceId, name, excludeId] : [workspaceId, name]))
    .first();
  if (existing) throw new HttpError(409, "A group with this name already exists");
}

export async function createGroup(db: import("../../types").Database, g: Omit<GroupRow, "updated_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO groups (id, workspace_id, name, color, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(g.id, g.workspace_id, g.name, g.color, g.sort_order, g.created_at)
    .run();
}

export async function updateGroup(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: Partial<Pick<GroupRow, "name" | "color" | "sort_order">>,
): Promise<boolean> {
  const upd = buildUpdate("groups", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM groups WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  const res = await db.prepare(upd.sql).bind(...upd.values).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteGroup(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  // Keep the tabs, clearing their deleted group's link.
  const results = await db.batch([
    db.prepare("UPDATE projects SET group_id = NULL WHERE workspace_id = ? AND group_id = ?").bind(workspaceId, id),
    db.prepare("DELETE FROM groups WHERE workspace_id = ? AND id = ?").bind(workspaceId, id),
  ]);
  return (results[results.length - 1].meta.changes ?? 0) > 0;
}

export async function reorderGroups(db: import("../../types").Database, workspaceId: string, ids: string[]): Promise<void> {
  await db.batch(
    ids.map((id, index) =>
      db.prepare("UPDATE groups SET sort_order = ? WHERE workspace_id = ? AND id = ?").bind(index, workspaceId, id),
    ),
  );
}

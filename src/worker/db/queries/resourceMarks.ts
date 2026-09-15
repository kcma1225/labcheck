import { buildUpdate } from "./_util";

export interface ResourceMarkRow {
  id: string;
  workspace_id: string;
  resource_id: string;
  page_number: number;
  note: string | null;
  created_at: number;
  updated_at: number | null;
}

export async function listMarks(
  db: import("../../types").Database,
  workspaceId: string,
  resourceId: string,
): Promise<ResourceMarkRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM resource_marks WHERE workspace_id = ? AND resource_id = ? ORDER BY page_number",
    )
    .bind(workspaceId, resourceId)
    .all<ResourceMarkRow>();
  return results ?? [];
}

export async function createMark(db: import("../../types").Database, m: Omit<ResourceMarkRow, "updated_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO resource_marks (id, workspace_id, resource_id, page_number, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(m.id, m.workspace_id, m.resource_id, m.page_number, m.note, m.created_at)
    .run();
}

export async function updateMark(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: Partial<Pick<ResourceMarkRow, "note">>,
): Promise<boolean> {
  const upd = buildUpdate("resource_marks", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM resource_marks WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  const res = await db.prepare(upd.sql).bind(...upd.values).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteMark(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM resource_marks WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteMarksForResource(
  db: import("../../types").Database,
  workspaceId: string,
  resourceId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM resource_marks WHERE workspace_id = ? AND resource_id = ?")
    .bind(workspaceId, resourceId)
    .run();
}

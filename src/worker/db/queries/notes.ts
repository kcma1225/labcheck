import { buildUpdate } from "./_util";

export interface NoteRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  content: string;
  created_at: number;
  updated_at: number | null;
}

export type NoteMeta = Omit<NoteRow, "content">;

/** List note metadata (no content) to keep the payload small. */
export async function listNotes(
  db: import("../../types").Database,
  workspaceId: string,
  projectId?: string | null,
): Promise<NoteMeta[]> {
  let sql =
    "SELECT id, workspace_id, project_id, title, created_at, updated_at FROM notes WHERE workspace_id = ?";
  const binds: unknown[] = [workspaceId];
  if (projectId) {
    sql += " AND project_id = ?";
    binds.push(projectId);
  }
  sql += " ORDER BY COALESCE(updated_at, created_at) DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<NoteMeta>();
  return results ?? [];
}

export async function getNote(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
): Promise<NoteRow | null> {
  return db
    .prepare("SELECT * FROM notes WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .first<NoteRow>();
}

export async function createNote(db: import("../../types").Database, n: Omit<NoteRow, "updated_at">): Promise<void> {
  await db
    .prepare(
      "INSERT INTO notes (id, workspace_id, project_id, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(n.id, n.workspace_id, n.project_id, n.title, n.content, n.created_at)
    .run();
}

export async function updateNote(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: Partial<Pick<NoteRow, "title" | "content" | "project_id">>,
): Promise<boolean> {
  const upd = buildUpdate("notes", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM notes WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  const res = await db.prepare(upd.sql).bind(...upd.values).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteNote(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM notes WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

import { buildUpdate } from "./_util";
import { ValidationError } from "../../lib/response";

export async function assertProject(
  db: import("../../types").Database, workspaceId: string, projectId: string | null | undefined,
): Promise<void> {
  if (projectId && !(await getProject(db, workspaceId, projectId))) {
    throw new ValidationError("Project does not belong to this workspace");
  }
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  group_id: string | null;
  /** #RRGGBB, or null for the default tab color. */
  color: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number | null;
}

export async function listProjects(db: import("../../types").Database, workspaceId: string): Promise<ProjectRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY sort_order, name")
    .bind(workspaceId)
    .all<ProjectRow>();
  return results ?? [];
}

export async function getProject(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
): Promise<ProjectRow | null> {
  return db
    .prepare("SELECT * FROM projects WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .first<ProjectRow>();
}

export async function createProject(
  db: import("../../types").Database,
  p: Omit<ProjectRow, "updated_at">,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO projects (id, workspace_id, name, description, group_id, color, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(p.id, p.workspace_id, p.name, p.description, p.group_id, p.color, p.sort_order, p.created_at)
    .run();
}

export async function reorderProjects(db: import("../../types").Database, workspaceId: string, ids: string[]): Promise<void> {
  await db.batch(
    ids.map((id, index) =>
      db.prepare("UPDATE projects SET sort_order = ? WHERE workspace_id = ? AND id = ?")
        .bind(index, workspaceId, id),
    ),
  );
}

export async function updateProject(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: Partial<Pick<ProjectRow, "name" | "description" | "group_id" | "color">>,
): Promise<boolean> {
  const upd = buildUpdate("projects", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM projects WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  const res = await db.prepare(upd.sql).bind(...upd.values).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteProject(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  // Keep the contents in the workspace, clearing their deleted project link.
  const results = await db.batch([
    ...["tasks", "events", "notes", "resources"].map((table) =>
      db.prepare(`UPDATE ${table} SET project_id = NULL WHERE workspace_id = ? AND project_id = ?`)
        .bind(workspaceId, id),
    ),
    db.prepare("DELETE FROM projects WHERE workspace_id = ? AND id = ?").bind(workspaceId, id),
  ]);
  return (results[results.length - 1].meta.changes ?? 0) > 0;
}

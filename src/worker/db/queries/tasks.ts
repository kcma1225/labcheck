import { buildUpdate } from "./_util";

export interface TaskRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: number | null;
  assignee_name: string | null;
  resource_id: string | null;
  created_at: number;
  updated_at: number | null;
}

export async function listTasks(
  db: import("../../types").Database,
  workspaceId: string,
  opts: { status?: string[]; projectId?: string | null } = {},
): Promise<TaskRow[]> {
  let sql = "SELECT * FROM tasks WHERE workspace_id = ?";
  const binds: unknown[] = [workspaceId];

  if (opts.status && opts.status.length) {
    sql += ` AND status IN (${opts.status.map(() => "?").join(", ")})`;
    binds.push(...opts.status);
  }
  if (opts.projectId) {
    sql += " AND project_id = ?";
    binds.push(opts.projectId);
  }
  sql += " ORDER BY (due_date IS NULL), due_date, created_at DESC";

  const { results } = await db.prepare(sql).bind(...binds).all<TaskRow>();
  return results ?? [];
}

export async function createTask(db: import("../../types").Database, t: Omit<TaskRow, "updated_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO tasks (id, workspace_id, project_id, title, description, status, due_date, assignee_name, resource_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      t.id,
      t.workspace_id,
      t.project_id,
      t.title,
      t.description,
      t.status,
      t.due_date,
      t.assignee_name,
      t.resource_id,
      t.created_at,
    )
    .run();
}

export async function updateTask(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: Partial<Pick<TaskRow, "title" | "description" | "status" | "due_date" | "assignee_name" | "project_id" | "resource_id">>,
): Promise<boolean> {
  const upd = buildUpdate("tasks", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM tasks WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  const res = await db.prepare(upd.sql).bind(...upd.values).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function deleteTask(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM tasks WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

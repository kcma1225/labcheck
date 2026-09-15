import { ValidationError } from "../../lib/response";

export interface ResourceRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  type: string; // url | file
  url: string | null;
  storage_key: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: number;
}

export async function listResources(
  db: import("../../types").Database,
  workspaceId: string,
  projectId?: string | null,
): Promise<ResourceRow[]> {
  let sql = "SELECT * FROM resources WHERE workspace_id = ?";
  const binds: unknown[] = [workspaceId];
  if (projectId) {
    sql += " AND project_id = ?";
    binds.push(projectId);
  }
  sql += " ORDER BY created_at DESC";
  const { results } = await db.prepare(sql).bind(...binds).all<ResourceRow>();
  return results ?? [];
}

export async function getResource(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
): Promise<ResourceRow | null> {
  return db
    .prepare("SELECT * FROM resources WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .first<ResourceRow>();
}

export async function createResource(db: import("../../types").Database, r: ResourceRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO resources (id, workspace_id, project_id, name, type, url, storage_key, mime_type, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.id,
      r.workspace_id,
      r.project_id,
      r.name,
      r.type,
      r.url,
      r.storage_key,
      r.mime_type,
      r.file_size,
      r.created_at,
    )
    .run();
}

/** Any resource in the workspace qualifies — deliberately not scoped to one tab, so a
 *  task can link a resource uploaded under a different tab. */
export async function assertResource(
  db: import("../../types").Database, workspaceId: string, resourceId: string | null | undefined,
): Promise<void> {
  if (resourceId && !(await getResource(db, workspaceId, resourceId))) {
    throw new ValidationError("Resource does not belong to this workspace");
  }
}

export async function deleteResource(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM resources WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

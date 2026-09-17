export interface WorkspaceRow {
  id: string;
  public_id: string;
  name: string;
  password_hash: string;
  created_at: number;
  updated_at: number | null;
}

export async function getWorkspace(db: import("../../types").Database, id: string): Promise<WorkspaceRow | null> {
  return db.prepare("SELECT * FROM workspaces WHERE id = ?").bind(id).first<WorkspaceRow>();
}

export async function getWorkspaceByPublicId(db: import("../../types").Database, publicId: string): Promise<WorkspaceRow | null> {
  return db.prepare("SELECT * FROM workspaces WHERE public_id = ?").bind(publicId).first<WorkspaceRow>();
}

export interface WorkspaceSummary {
  id: string;
  public_id: string;
  name: string;
  created_at: number;
  updated_at: number | null;
}

export async function listWorkspaces(db: import("../../types").Database): Promise<WorkspaceSummary[]> {
  const { results } = await db
    .prepare("SELECT id, public_id, name, created_at, updated_at FROM workspaces ORDER BY created_at DESC")
    .all<WorkspaceSummary>();
  return results ?? [];
}

export async function createWorkspace(
  db: import("../../types").Database,
  w: { id: string; public_id: string; name: string; password_hash: string; created_at: number },
): Promise<void> {
  await db
    .prepare("INSERT INTO workspaces (id, public_id, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(w.id, w.public_id, w.name, w.password_hash, w.created_at)
    .run();
}

export async function rotateWorkspacePublicId(db: import("../../types").Database, id: string, publicId: string): Promise<boolean> {
  const results = await db.batch([
    db.prepare("UPDATE workspaces SET public_id = ?, updated_at = ? WHERE id = ?").bind(publicId, Date.now(), id),
    db.prepare("DELETE FROM workspace_sessions WHERE workspace_id = ?").bind(id),
  ]);
  return results[0].meta.changes > 0;
}

export async function renameWorkspace(db: import("../../types").Database, id: string, name: string): Promise<void> {
  await db.prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?").bind(name, Date.now(), id).run();
}

export async function setWorkspacePassword(db: import("../../types").Database, id: string, passwordHash: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE workspaces SET password_hash = ?, updated_at = ? WHERE id = ?").bind(passwordHash, Date.now(), id),
    db.prepare("DELETE FROM workspace_sessions WHERE workspace_id = ?").bind(id),
  ]);
}

export async function deleteWorkspace(db: import("../../types").Database, id: string): Promise<void> {
  const tables = ["workspace_sessions", "projects", "tasks", "events", "notes", "resources"];
  const stmts = tables.map((t) => db.prepare(`DELETE FROM ${t} WHERE workspace_id = ?`).bind(id));
  stmts.push(db.prepare("DELETE FROM workspaces WHERE id = ?").bind(id));
  await db.batch(stmts);
}

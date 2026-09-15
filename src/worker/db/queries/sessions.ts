export interface SessionRow {
  id: string;
  workspace_id: string;
  expires_at: number;
  created_at: number;
}

export async function getSession(db: import("../../types").Database, id: string): Promise<SessionRow | null> {
  return db.prepare("SELECT * FROM workspace_sessions WHERE id = ?").bind(id).first<SessionRow>();
}

export async function createSession(db: import("../../types").Database, s: SessionRow): Promise<void> {
  await db
    .prepare(
      "INSERT INTO workspace_sessions (id, workspace_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(s.id, s.workspace_id, s.expires_at, s.created_at)
    .run();
}

export async function deleteSession(db: import("../../types").Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM workspace_sessions WHERE id = ?").bind(id).run();
}


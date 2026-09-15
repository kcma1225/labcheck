export interface PasskeyRow {
  id: string;
  workspace_id: string;
  name: string;
  public_key: string;
  algorithm: string;
  counter: number;
  created_at: number;
  last_used_at: number | null;
}

export type PasskeySummaryRow = Pick<PasskeyRow, "id" | "name" | "created_at" | "last_used_at">;

export async function listPasskeys(db: import("../../types").Database, workspaceId: string): Promise<PasskeySummaryRow[]> {
  const { results } = await db
    .prepare("SELECT id, name, created_at, last_used_at FROM passkey_credentials WHERE workspace_id = ? ORDER BY created_at")
    .bind(workspaceId)
    .all<PasskeySummaryRow>();
  return results ?? [];
}

export async function countPasskeys(db: import("../../types").Database, workspaceId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM passkey_credentials WHERE workspace_id = ?")
    .bind(workspaceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Full row, including the public key/counter — used only for verifying a login. */
export async function getPasskey(db: import("../../types").Database, workspaceId: string, id: string): Promise<PasskeyRow | null> {
  return db
    .prepare("SELECT * FROM passkey_credentials WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .first<PasskeyRow>();
}

export async function createPasskey(db: import("../../types").Database, row: Omit<PasskeyRow, "last_used_at">): Promise<void> {
  await db
    .prepare(
      `INSERT INTO passkey_credentials (id, workspace_id, name, public_key, algorithm, counter, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.workspace_id, row.name, row.public_key, row.algorithm, row.counter, row.created_at)
    .run();
}

export async function touchPasskey(db: import("../../types").Database, id: string, counter: number, lastUsedAt: number): Promise<void> {
  await db
    .prepare("UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(counter, lastUsedAt, id)
    .run();
}

export async function deletePasskey(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM passkey_credentials WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

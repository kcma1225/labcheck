export interface PushSubscriptionRow {
  id: string;
  workspace_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
}

export async function listPushSubscriptions(db: import("../../types").Database, workspaceId: string): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM push_subscriptions WHERE workspace_id = ?")
    .bind(workspaceId)
    .all<PushSubscriptionRow>();
  return results ?? [];
}

/** One row per endpoint — re-subscribing the same browser refreshes its keys instead of duplicating. */
export async function upsertPushSubscription(db: import("../../types").Database, row: PushSubscriptionRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, workspace_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth`,
    )
    .bind(row.id, row.workspace_id, row.endpoint, row.p256dh, row.auth, row.created_at)
    .run();
}

export async function deletePushSubscription(db: import("../../types").Database, workspaceId: string, endpoint: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM push_subscriptions WHERE workspace_id = ? AND endpoint = ?")
    .bind(workspaceId, endpoint)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Used when a push service reports a subscription as gone (404/410), regardless of workspace. */
export async function deletePushSubscriptionByEndpoint(db: import("../../types").Database, endpoint: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
}

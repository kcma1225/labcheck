// Finds tasks due soon / events starting soon that haven't been reminded yet,
// and pushes one notification per item to every subscription on that
// workspace. `reminder_sent_at` gates each item to a single reminder, ever.

import type { Env } from "../types";
import { sendWebPush, type VapidKeys } from "./webPush";
import { listPushSubscriptions, deletePushSubscription } from "../db/queries/pushSubscriptions";

const TASK_LOOKAHEAD_MS = 24 * 60 * 60 * 1000; // remind on tasks due within 24h
const EVENT_LOOKAHEAD_MS = 2 * 60 * 60 * 1000; // remind on events starting within 2h

interface DueRow {
  id: string;
  workspace_id: string;
  title: string;
  when_at: number;
}

export async function sendDueReminders(env: Env): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK || !env.VAPID_SUBJECT) return;
  const vapid: VapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: JSON.parse(env.VAPID_PRIVATE_KEY_JWK),
    subject: env.VAPID_SUBJECT,
  };

  const now = Date.now();

  const { results: dueTasks } = await env.DB.prepare(
    `SELECT id, workspace_id, title, due_date AS when_at FROM tasks
     WHERE reminder_sent_at IS NULL AND status != 'done'
       AND due_date IS NOT NULL AND due_date <= ?`,
  )
    .bind(now + TASK_LOOKAHEAD_MS)
    .all<DueRow>();

  const { results: dueEvents } = await env.DB.prepare(
    `SELECT id, workspace_id, title, start_at AS when_at FROM events
     WHERE reminder_sent_at IS NULL AND start_at <= ?`,
  )
    .bind(now + EVENT_LOOKAHEAD_MS)
    .all<DueRow>();

  const subsByWorkspace = new Map<string, Awaited<ReturnType<typeof listPushSubscriptions>>>();
  async function subsFor(workspaceId: string) {
    if (!subsByWorkspace.has(workspaceId)) {
      subsByWorkspace.set(workspaceId, await listPushSubscriptions(env.DB, workspaceId));
    }
    return subsByWorkspace.get(workspaceId)!;
  }

  for (const row of dueTasks ?? []) {
    await notify(env, vapid, await subsFor(row.workspace_id), {
      title: "Task due soon",
      body: row.title,
      url: "/",
    });
    await env.DB.prepare("UPDATE tasks SET reminder_sent_at = ? WHERE id = ?").bind(now, row.id).run();
  }

  for (const row of dueEvents ?? []) {
    await notify(env, vapid, await subsFor(row.workspace_id), {
      title: "Upcoming event",
      body: row.title,
      url: "/",
    });
    await env.DB.prepare("UPDATE events SET reminder_sent_at = ? WHERE id = ?").bind(now, row.id).run();
  }
}

async function notify(
  env: Env,
  vapid: VapidKeys,
  subs: Awaited<ReturnType<typeof listPushSubscriptions>>,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  for (const sub of subs) {
    const result = await sendWebPush(sub, payload, vapid);
    if (result.gone) await deletePushSubscription(env.DB, sub.workspace_id, sub.endpoint);
  }
}

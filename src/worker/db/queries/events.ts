import { buildUpdate } from "./_util";
import { ValidationError } from "../../lib/response";

export interface EventRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  type: string;
  start_at: number;
  end_at: number | null;
  all_day: number;
  color: string | null;
  location: string | null;
  url: string | null;
  created_at: number;
  updated_at: number | null;
}

/** Range query so the calendar only loads one month at a time (spec section 23). */
export async function listEvents(
  db: import("../../types").Database,
  workspaceId: string,
  opts: { fromMs: number; toMs: number; projectId?: string | null },
): Promise<EventRow[]> {
  let sql =
    "SELECT * FROM events WHERE workspace_id = ? AND start_at <= ? AND COALESCE(end_at, start_at) >= ?";
  const binds: unknown[] = [workspaceId, opts.toMs, opts.fromMs];

  if (opts.projectId) {
    sql += " AND project_id = ?";
    binds.push(opts.projectId);
  }
  sql += " ORDER BY start_at";

  const { results } = await db.prepare(sql).bind(...binds).all<EventRow>();
  return results ?? [];
}

type EventInsert = Omit<EventRow, "updated_at">;

export async function createEvent(db: import("../../types").Database, e: EventInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO events
         (id, workspace_id, project_id, title, description, type, start_at, end_at, all_day, color, location, url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.id,
      e.workspace_id,
      e.project_id,
      e.title,
      e.description,
      e.type,
      e.start_at,
      e.end_at,
      e.all_day,
      e.color,
      e.location,
      e.url,
      e.created_at,
    )
    .run();
}

type EventPatch = Partial<
  Pick<
    EventRow,
    | "title"
    | "description"
    | "type"
    | "start_at"
    | "end_at"
    | "all_day"
    | "color"
    | "location"
    | "url"
    | "project_id"
  >
>;

export async function updateEvent(
  db: import("../../types").Database,
  workspaceId: string,
  id: string,
  fields: EventPatch,
): Promise<boolean> {
  const upd = buildUpdate("events", fields, { workspace_id: workspaceId, id });
  if (!upd) {
    return !!(await db.prepare("SELECT id FROM events WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, id).first());
  }
  // Check the merged interval in SQL, so concurrent partial edits cannot
  // each pass validation and together produce an invalid interval.
  const start = fields.start_at === undefined ? "start_at" : "?";
  const end = fields.end_at === undefined ? "end_at" : "CAST(? AS BIGINT)";
  const endValues = fields.end_at === undefined ? [] : [fields.end_at];
  const startValues = fields.start_at === undefined ? [] : [fields.start_at];
  const res = await db.prepare(`${upd.sql} AND (${end} IS NULL OR ${end} >= ${start})`)
    .bind(...upd.values, ...endValues, ...endValues, ...startValues).run();
  if ((res.meta.changes ?? 0) > 0) return true;
  const exists = await db.prepare("SELECT id FROM events WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id).first();
  if (!exists) return false;
  throw new ValidationError("End must be after start");
}

export async function deleteEvent(db: import("../../types").Database, workspaceId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM events WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

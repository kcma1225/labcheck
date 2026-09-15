import { assertProject } from "../db/queries/projects";
import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  str,
  optionalStr,
  oneOf,
  optionalInt,
  requiredInt,
  optionalId,
  optionalBool,
  optionalColor,
  parseDateRange,
} from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { listEvents, createEvent, updateEvent, deleteEvent } from "../db/queries/events";

const TYPES = ["meeting", "deadline", "milestone", "event"] as const;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const events = new Hono<AppEnv>();

/** GET /api/workspaces/:id/events?from=YYYY-MM-DD&to=YYYY-MM-DD (spec section 23). */
events.get("/", async (c) => {
  const { fromMs, toMs } = parseDateRange(c.req.query("from"), c.req.query("to"));
  const rows = await listEvents(c.env.DB, c.get("workspaceId"), {
    fromMs,
    toMs,
    projectId: c.req.query("projectId") ?? null,
  });
  return c.json({ events: rows });
});

events.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const allDay = optionalBool(body.all_day) ?? false;
  const startAt = requiredInt(body.start_at, "start_at");
  const endAt = optionalInt(body.end_at, "end_at") ?? startAt + (allDay ? DAY : HOUR);
  if (endAt < startAt) return c.json({ error: "End must be after start" }, 400);

  const row = {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    project_id: optionalId(body.project_id, "project_id"),
    title: str(body.title, 1, 200, "Event title"),
    description: optionalStr(body.description, 5000, "Description"),
    type: body.type === undefined ? "event" : oneOf(body.type, TYPES, "type"),
    start_at: startAt,
    end_at: endAt,
    all_day: allDay ? 1 : 0,
    color: optionalColor(body.color, "color"),
    location: optionalStr(body.location, 500, "Location"),
    url: optionalStr(body.url, 2000, "Link"),
    created_at: Date.now(),
  };
  await assertProject(c.env.DB, row.workspace_id, row.project_id);
  await createEvent(c.env.DB, row);
  return c.json({ event: { ...row, updated_at: null } }, 201);
});

events.patch("/:eventId", async (c) => {
  const body = await readJson(c.req.raw);
  const allDay = optionalBool(body.all_day);
  const fields = {
    title: body.title === undefined ? undefined : str(body.title, 1, 200, "Event title"),
    description:
      body.description === undefined ? undefined : optionalStr(body.description, 5000, "Description"),
    type: body.type === undefined ? undefined : oneOf(body.type, TYPES, "type"),
    start_at: body.start_at === undefined ? undefined : requiredInt(body.start_at, "start_at"),
    end_at: body.end_at === undefined ? undefined : optionalInt(body.end_at, "end_at"),
    all_day: allDay === undefined ? undefined : allDay ? 1 : 0,
    color: body.color === undefined ? undefined : optionalColor(body.color, "color"),
    location: body.location === undefined ? undefined : optionalStr(body.location, 500, "Location"),
    url: body.url === undefined ? undefined : optionalStr(body.url, 2000, "Link"),
    project_id: body.project_id === undefined ? undefined : optionalId(body.project_id, "project_id"),
  };
  if (
    typeof fields.start_at === "number" &&
    typeof fields.end_at === "number" &&
    fields.end_at < fields.start_at
  ) {
    return c.json({ error: "End must be after start" }, 400);
  }
  await assertProject(c.env.DB, c.get("workspaceId"), fields.project_id);
  const ok = await updateEvent(c.env.DB, c.get("workspaceId"), c.req.param("eventId"), fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

events.delete("/:eventId", async (c) => {
  const ok = await deleteEvent(c.env.DB, c.get("workspaceId"), c.req.param("eventId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default events;

import { assertProject } from "../db/queries/projects";
import { readJson } from "../lib/http";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { str, noteContent, optionalId } from "../middleware/validation";
import { randomId } from "../lib/crypto";
import { listNotes, getNote, createNote, updateNote, deleteNote } from "../db/queries/notes";

const NOTE_MAX = 100_000;

const notes = new Hono<AppEnv>();

notes.get("/", async (c) => {
  const rows = await listNotes(c.env.DB, c.get("workspaceId"), c.req.query("projectId") ?? null);
  return c.json({ notes: rows });
});

notes.post("/", async (c) => {
  const body = await readJson(c.req.raw);
  const now = Date.now();
  const row = {
    id: randomId(16),
    workspace_id: c.get("workspaceId"),
    project_id: optionalId(body.project_id, "project_id"),
    title: str(body.title, 1, 200, "Note title"),
    content: noteContent(body.content, NOTE_MAX),
    created_at: now,
  };
  await assertProject(c.env.DB, row.workspace_id, row.project_id);
  await createNote(c.env.DB, row);
  return c.json({ note: { ...row, updated_at: null } }, 201);
});

notes.get("/:noteId", async (c) => {
  const n = await getNote(c.env.DB, c.get("workspaceId"), c.req.param("noteId"));
  if (!n) return c.json({ error: "Not Found" }, 404);
  return c.json({ note: n });
});

notes.patch("/:noteId", async (c) => {
  const body = await readJson(c.req.raw);
  const fields = {
    title: body.title === undefined ? undefined : str(body.title, 1, 200, "Note title"),
    content: body.content === undefined ? undefined : noteContent(body.content, NOTE_MAX),
    project_id: body.project_id === undefined ? undefined : optionalId(body.project_id, "project_id"),
  };
  await assertProject(c.env.DB, c.get("workspaceId"), fields.project_id);
  const ok = await updateNote(c.env.DB, c.get("workspaceId"), c.req.param("noteId"), fields);
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

notes.delete("/:noteId", async (c) => {
  const ok = await deleteNote(c.env.DB, c.get("workspaceId"), c.req.param("noteId"));
  if (!ok) return c.json({ error: "Not Found" }, 404);
  return c.json({ ok: true });
});

export default notes;

import { useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Button, Card, Empty, ErrorText, Field, GhostButton, Icon, Input, Modal, Textarea } from "./ui";
import { fmtDateTime } from "../lib/date";
import { renderMarkdown } from "../lib/markdown";
import type { Note } from "../../shared/types";

type NoteMeta = Pick<Note, "id" | "title" | "created_at" | "updated_at">;

/** Notes scoped to one tab (project) — the workspace no longer has a standalone Notes page. */
export function NotesPanel({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const list = useAsync<{ notes: NoteMeta[] }>(
    () => api.get(`/workspaces/${workspaceId}/notes?projectId=${projectId}`),
    [workspaceId, projectId],
  );

  const [selected, setSelected] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  async function select(id: string) {
    const r = await api.get(`/workspaces/${workspaceId}/notes/${id}`);
    setSelected(r.note);
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Remove "${selected.title}"? This cannot be undone.`)) return;
    await api.delete(`/workspaces/${workspaceId}/notes/${selected.id}`);
    setSelected(null);
    list.reload();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card
        title="Notes"
        actions={
          <GhostButton onClick={() => setCreating(true)} aria-label="New note">
            <Icon name="plus" className="h-3.5 w-3.5" />
          </GhostButton>
        }
      >
        {list.loading ? (
          <Empty>Loading…</Empty>
        ) : (list.data?.notes.length ?? 0) === 0 ? (
          <Empty>No notes.</Empty>
        ) : (
          <ul className="space-y-1">
            {list.data!.notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => select(n.id)}
                  className={`w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-gray-100 ${
                    selected?.id === n.id ? "bg-gray-100 font-medium" : ""
                  }`}
                >
                  {n.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={selected ? selected.title : "Notes"}
        actions={
          selected && (
            <div className="flex items-center gap-2">
              <GhostButton onClick={() => setEditing(true)}>
                <Icon name="edit" className="h-3.5 w-3.5" />
                Edit
              </GhostButton>
              <Button variant="danger" onClick={remove}>
                <Icon name="trash" className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )
        }
      >
        {!selected ? (
          <Empty>Choose a note from the list, or create a new one.</Empty>
        ) : (
          <div>
            <div
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.content) }}
            />
            {selected.updated_at && (
              <p className="mt-4 text-xs text-gray-400">
                Updated <span className="font-medium text-gray-600">{fmtDateTime(selected.updated_at)}</span>
              </p>
            )}
          </div>
        )}
      </Card>

      {creating && (
        <NoteFormDialog
          workspaceId={workspaceId}
          projectId={projectId}
          note={null}
          onClose={() => setCreating(false)}
          onSaved={(note) => {
            setCreating(false);
            setSelected(note);
            list.reload();
          }}
        />
      )}

      {editing && selected && (
        <NoteFormDialog
          workspaceId={workspaceId}
          projectId={projectId}
          note={selected}
          onClose={() => setEditing(false)}
          onSaved={(note) => {
            setEditing(false);
            setSelected(note);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function NoteFormDialog({
  workspaceId,
  projectId,
  note,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  projectId: string;
  note: Note | null;
  onClose: () => void;
  onSaved: (note: Note) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (note) {
        await api.patch(`/workspaces/${workspaceId}/notes/${note.id}`, { title, content });
        onSaved({ ...note, title, content });
      } else {
        const r = await api.post(`/workspaces/${workspaceId}/notes`, { title, content, project_id: projectId });
        onSaved(r.note);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={note ? "Edit note" : "New note"}>
      <div className="space-y-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label="Content">
          <Textarea
            rows={12}
            placeholder="Markdown…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono"
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button onClick={save} disabled={busy || !title.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

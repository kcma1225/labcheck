import { lazy, Suspense, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, fileUrl } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Button, Card, Empty, ErrorText, Field, Icon, Input, Modal } from "./ui";
import { ResourcePicker } from "./ResourcePicker";
import { fmtDate, toDateInput } from "../lib/date";
import { isPdfResource } from "../lib/resources";
import type { Project, Resource, Task, TaskStatus } from "../../shared/types";

// pdfjs-dist is sizable — only fetch it when a PDF is actually opened.
const PdfViewerDialog = lazy(() =>
  import("./PdfViewerDialog").then((m) => ({ default: m.PdfViewerDialog })),
);

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "Not started", doing: "Progressing", done: "Done" };
const STATUS_SELECT_STYLE: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-600 border-gray-200",
  doing: "bg-amber-100 text-amber-700 border-amber-200",
  done: "bg-green-100 text-green-700 border-green-200",
};

const FILTERS: { key: TaskStatus | "all"; label: string; cardTitle: string }[] = [
  { key: "all", label: "All", cardTitle: "All tasks" },
  { key: "todo", label: "Todo", cardTitle: "Not started" },
  { key: "doing", label: "Doing", cardTitle: "Progressing" },
  { key: "done", label: "Done", cardTitle: "Done" },
];

/** URL resources open directly; uploaded files open through the authenticated download route. */
function resourceLink(workspaceId: string, r: Resource): string {
  return r.type === "url" && r.url ? r.url : fileUrl(workspaceId, r.id);
}

/** Todo scoped to one tab (project) — items created here also show on the Dashboard. */
export function TasksPanel({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const query = filter === "all" ? "" : `&status=${filter}`;

  const { data, loading, error, reload } = useAsync<{ tasks: Task[] }>(
    () => api.get(`/workspaces/${workspaceId}/tasks?projectId=${projectId}${query}`),
    [workspaceId, projectId, query],
  );
  const projects = useAsync<{ projects: Project[] }>(
    () => api.get(`/workspaces/${workspaceId}/projects`),
    [workspaceId],
  );
  // Every workspace resource, not just this tab's — a linked task's resource
  // may live under a different tab (search covers all tabs when linking).
  const resources = useAsync<{ resources: Resource[] }>(
    () => api.get(`/workspaces/${workspaceId}/resources`),
    [workspaceId],
  );
  const resourceById = useMemo(
    () => new Map((resources.data?.resources ?? []).map((r) => [r.id, r])),
    [resources.data],
  );

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [viewingPdf, setViewingPdf] = useState<Resource | null>(null);

  async function patch(id: string, body: Partial<Task>) {
    await api.patch(`/workspaces/${workspaceId}/tasks/${id}`, body);
    reload();
  }

  async function remove(id: string) {
    await api.delete(`/workspaces/${workspaceId}/tasks/${id}`);
    reload();
  }

  return (
    <Card
      title={FILTERS.find((f) => f.key === filter)?.cardTitle}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  filter === f.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" />
            New task
          </Button>
        </div>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}
      {loading ? (
        <Empty>Loading…</Empty>
      ) : (data?.tasks.length ?? 0) === 0 ? (
        <Empty>No tasks.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data!.tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-3">
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={(e) => patch(t.id, { status: e.target.checked ? "done" : "todo" })}
                aria-label={t.status === "done" ? "Mark unfinished" : "Mark finished"}
              />
              <select
                value={t.status}
                onChange={(e) => patch(t.id, { status: e.target.value as TaskStatus })}
                className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${STATUS_SELECT_STYLE[t.status]}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <span className="relative min-w-0 basis-40 flex-1 break-words text-sm">
                <span
                  className={`transition-colors duration-300 ${
                    t.status === "done" ? "text-gray-400" : "text-gray-800"
                  }`}
                >
                  {t.title}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-1/2 h-px -translate-y-1/2 bg-gray-400 transition-[width] duration-300 ease-out"
                  style={{ width: t.status === "done" ? "100%" : "0%" }}
                />
              </span>
              {t.due_date && (
                <span className="text-xs font-medium text-gray-600">{fmtDate(t.due_date)}</span>
              )}
              {t.assignee_name && <span className="text-xs text-gray-400">{t.assignee_name}</span>}
              {(() => {
                const linked = t.resource_id ? resourceById.get(t.resource_id) : undefined;
                if (!linked) return null;
                return (
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={resourceLink(workspaceId, linked)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open ${linked.name}`}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
                    >
                      <Icon name={linked.type === "url" ? "link" : "file"} className="h-3 w-3" />
                      <span className="max-w-[10rem] truncate">{linked.name}</span>
                    </a>
                    {isPdfResource(linked) && (
                      <button
                        type="button"
                        onClick={() => setViewingPdf(linked)}
                        title="Open in PDF reader"
                        aria-label="Open in PDF reader"
                        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Icon name="book-open" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                );
              })()}
              <button
                onClick={() => setEditing(t)}
                aria-label="Edit task"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <Icon name="edit" className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(t.id)}
                className="text-xs text-gray-400 hover:text-red-600"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <TaskFormDialog
          workspaceId={workspaceId}
          projectId={projectId}
          projects={projects.data?.projects ?? []}
          task={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {editing && (
        <TaskFormDialog
          workspaceId={workspaceId}
          projectId={projectId}
          projects={projects.data?.projects ?? []}
          task={editing}
          initialResource={editing.resource_id ? resourceById.get(editing.resource_id) ?? null : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {viewingPdf && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 text-sm text-onscrim">
              Loading viewer…
            </div>
          }
        >
          <PdfViewerDialog workspaceId={workspaceId} resource={viewingPdf} onClose={() => setViewingPdf(null)} />
        </Suspense>
      )}
    </Card>
  );
}

function TaskFormDialog({
  workspaceId,
  projectId,
  projects,
  task,
  initialResource = null,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  projectId: string;
  projects: Project[];
  task: Task | null;
  /** Full resource object for `task.resource_id`, so the picker can show its name without refetching. */
  initialResource?: Resource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [assignee, setAssignee] = useState(task?.assignee_name ?? "");
  const [due, setDue] = useState(task?.due_date ? toDateInput(task.due_date) : "");
  const [resource, setResource] = useState<Resource | null>(initialResource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const dueDate = due ? new Date(`${due}T00:00:00`).getTime() : null;
      if (task) {
        await api.patch(`/workspaces/${workspaceId}/tasks/${task.id}`, {
          title: title.trim(),
          assignee_name: assignee.trim() || null,
          due_date: dueDate,
          resource_id: resource?.id ?? null,
        });
      } else {
        await api.post(`/workspaces/${workspaceId}/tasks`, {
          title: title.trim(),
          project_id: projectId,
          assignee_name: assignee.trim() || undefined,
          due_date: dueDate ?? undefined,
          resource_id: resource?.id ?? undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={task ? "Edit task" : "New task"}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee (optional)">
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Due (optional)">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Resource (optional)">
          <ResourcePicker
            workspaceId={workspaceId}
            projects={projects}
            defaultProjectId={projectId}
            value={resource}
            onChange={setResource}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : task ? "Save changes" : "Add task"}
        </Button>
      </form>
    </Modal>
  );
}

import { lazy, Suspense, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, fileUrl } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Button, Card, Empty, ErrorText, Field, Icon, Input, Modal } from "./ui";
import { fmtDate } from "../lib/date";
import { formatBytes } from "../lib/format";
import { isPdfResource } from "../lib/resources";
import type { Resource } from "../../shared/types";

type Tab = "link" | "file";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

// pdfjs-dist is sizable — only fetch it when a PDF is actually opened.
const PdfViewerDialog = lazy(() =>
  import("./PdfViewerDialog").then((m) => ({ default: m.PdfViewerDialog })),
);

/** Resources scoped to one tab (project) — the workspace no longer has a standalone Resources page. */
export function ResourcesPanel({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const { data, loading, error, reload } = useAsync<{ resources: Resource[] }>(
    () => api.get(`/workspaces/${workspaceId}/resources?projectId=${projectId}`),
    [workspaceId, projectId],
  );

  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Resource | null>(null);

  async function remove(r: Resource) {
    if (!window.confirm(`Remove "${r.name}"? This cannot be undone.`)) return;
    await api.delete(`/workspaces/${workspaceId}/resources/${r.id}`);
    reload();
  }

  return (
    <Card
      title={`Saved${data ? ` (${data.resources.length})` : ""}`}
      actions={
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add resource
        </Button>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}
      {loading ? (
        <Empty>Loading…</Empty>
      ) : (data?.resources.length ?? 0) === 0 ? (
        <Empty>Nothing saved yet.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data!.resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Icon name={r.type === "url" ? "link" : "file"} />
              </span>
              <div className="min-w-0 flex-1">
                {isPdfResource(r) ? (
                  <button
                    onClick={() => setViewing(r)}
                    className="block max-w-full truncate text-left text-sm font-medium text-gray-800 hover:underline"
                  >
                    {r.name}
                  </button>
                ) : (
                  <a
                    href={r.type === "url" && r.url ? r.url : fileUrl(workspaceId, r.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium text-gray-800 hover:underline"
                  >
                    {r.name}
                  </a>
                )}
                <div className="truncate text-xs text-gray-400">
                  {r.type === "url"
                    ? r.url
                    : [r.mime_type, r.file_size != null ? formatBytes(r.file_size) : null]
                        .filter(Boolean)
                        .join(" · ")}
                  {" · "}
                  <span className="font-medium text-gray-600">{fmtDate(r.created_at)}</span>
                </div>
              </div>
              {isPdfResource(r) && (
                <a
                  href={fileUrl(workspaceId, r.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in new tab"
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Icon name="external" className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={() => remove(r)}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                <Icon name="trash" className="h-3.5 w-3.5" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddResourceDialog
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setAdding(false)}
          onAdded={reload}
        />
      )}

      {viewing && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 text-sm text-onscrim">
              Loading viewer…
            </div>
          }
        >
          <PdfViewerDialog workspaceId={workspaceId} resource={viewing} onClose={() => setViewing(null)} />
        </Suspense>
      )}
    </Card>
  );
}

function AddResourceDialog({
  workspaceId,
  projectId,
  onClose,
  onAdded,
}: {
  workspaceId: string;
  projectId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<Tab>("file");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function resetForm() {
    setName("");
    setUrl("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setOk(null);
    setBusy(true);
    try {
      if (tab === "link") {
        if (!url.trim()) throw new Error("A URL is required");
        await api.post(`/workspaces/${workspaceId}/resources`, {
          type: "url",
          name: name.trim() || url.trim(),
          url: url.trim(),
          project_id: projectId,
        });
        setOk("Link added");
      } else {
        if (!file) throw new Error("Choose a file first");
        const form = new FormData();
        form.append("file", file, file.name);
        form.append("name", name.trim() || file.name);
        form.append("project_id", projectId);
        await api.upload(`/workspaces/${workspaceId}/files`, form);
        setOk(`Uploaded ${file.name}`);
      }
      resetForm();
      onAdded();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add resource">
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
        {(["file", "link"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setFormError(null);
              setOk(null);
            }}
            className={`rounded-md px-3 py-1 font-medium capitalize ${
              tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t === "link" ? "Add link" : "Upload file"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {tab === "link" ? (
          <>
            <Field label="URL">
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://arxiv.org/abs/…"
                autoFocus
              />
            </Field>
            <Field label="Name (optional)">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="File">
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-gray-700"
              />
            </Field>
            <p className="text-xs text-gray-400">PDF, PNG, JPEG or WebP · up to 95 MB</p>
            <Field label="Name (optional)">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || (tab === "link" ? !url.trim() : !file)}>
            {busy ? "Saving…" : tab === "link" ? "Add link" : "Upload"}
          </Button>
          {ok && <span className="text-sm text-green-600">{ok}</span>}
        </div>
        <ErrorText>{formError}</ErrorText>
      </form>
    </Modal>
  );
}

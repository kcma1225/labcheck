import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Button, Card, Empty, ErrorText, Field, GhostButton, Input, Modal } from "./ui";
import { fmtDateTime } from "../lib/date";
import { renderMarkdown } from "../lib/markdown";
import { editMarkdown, fileCompletion, filterFiles, insertFileLink, markdownTools, type MarkdownTool } from "../lib/markdown-edit";
import type { Note, Project, Resource } from "../../shared/types";

const iconPaths = {
  bold: "M6 4h7a4 4 0 0 1 0 8H6m0-8v16h8a4 4 0 0 0 0-8H6",
  italic: "M10 4h10M4 20h10M15 4 9 20",
  strike: "M18 5c-5-4-12-1-10 4m8 6c3 6-7 7-10 3M3 12h18",
  link: "m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1",
  heading: "M5 4v16M19 4v16M5 12h14",
  bullet: "M4 6h1M4 12h1M4 18h1M9 6h11M9 12h11M9 18h11",
  number: "M3 4h1v5M2 13c4-3 4 2 0 5h4M10 6h11M10 12h11M10 18h11",
  task: "m3 11 3 3 6-7M14 7h7M14 13h7M3 20h18",
  quote: "M4 5h6v8H4V5m6 8c0 4-2 6-5 6M14 5h6v8h-6V5m6 8c0 4-2 6-5 6",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  fence: "M8 3H5v18h3M16 3h3v18h-3M9 9l-2 3 2 3m6-6 2 3-2 3",
  rule: "M3 12h18",
  file: "M14 2H4v20h16V8l-6-6v6h6M8 15h8M12 11v8",
  view: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  edit: "m4 16-1 5 5-1L21 7l-4-4L4 16m10-10 4 4",
  split: "M3 4h18v16H3V4m9 0v16",
  save: "M4 3h13l4 4v14H3V3h1m3 0v6h10V3M7 21v-7h10v7",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
};

function EditorIcon({ name }: { name: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

type NoteMeta = Pick<Note, "id" | "title" | "created_at" | "updated_at">;

export function NotesPanel(props: { workspaceId: string; projectId: string }) {
  return <NotesEditor key={`${props.workspaceId}:${props.projectId}`} {...props} />;
}

function NotesEditor({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const base = `/workspaces/${workspaceId}/notes`;
  const list = useAsync<{ notes: NoteMeta[] }>(() => api.get(`${base}?projectId=${projectId}`), [workspaceId, projectId]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "split">("view");
  const editing = mode !== "view";
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState(projectId);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [dismissed, setDismissed] = useState(false);
  const [activeFile, setActiveFile] = useState(0);
  const resources = useAsync<{ resources: Resource[] }>(() => api.get(`/workspaces/${encodeURIComponent(workspaceId)}/resources`), [workspaceId]);
  const projects = useAsync<{ projects: Project[] }>(() => api.get(`/workspaces/${encodeURIComponent(workspaceId)}/projects`), [workspaceId]);
  const completion = !dismissed && !picker ? fileCompletion(content, range.start, range.end) : null;
  const showFiles = editing && (picker || !!completion);
  const files = filterFiles(resources.data?.resources ?? [], workspaceId, scope, completion?.query ?? query);
  const activeIndex = Math.min(activeFile, Math.max(0, files.length - 1));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const request = useRef(0);
  const mutation = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const compositionEnded = useRef(0);
  const dirty = !!selected && (title !== selected.title || content !== selected.content);
  const guard = useRef(false);
  guard.current = dirty || busy || creating;

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (guard.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || !guard.current || event.defaultPrevented) return;
      if (anchor.closest('[aria-label="Markdown preview"]') && anchor.getAttribute("href")?.startsWith("/api/workspaces/")) return;
      if (!window.confirm("Leave this note? Unsaved changes will be lost; pending requests may still finish.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      ++request.current;
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, []);

  function allowDiscard() {
    return !mutation.current && (!dirty || window.confirm("Discard unsaved changes to this note?"));
  }

  function open(note: Note, edit: boolean) {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
    setMode(edit ? "edit" : "view");
    setPicker(false);
    setDismissed(true);
    setError(null);
    setFailedId(null);
  }

  async function select(id: string) {
    if (selected?.id === id || !allowDiscard()) return;
    const token = ++request.current;
    setSelected(null);
    setLoading(true);
    setError(null);
    setFailedId(null);
    try {
      const result = await api.get(`${base}/${id}`);
      if (token === request.current) open(result.note, false);
    } catch (err) {
      if (token === request.current) { setError((err as Error).message); setFailedId(id); }
    } finally {
      if (token === request.current) setLoading(false);
    }
  }

  async function save() {
    if (!selected || mutation.current || composing.current || Date.now() - compositionEnded.current < 100 || !title.trim()) return;
    mutation.current = true;
    const token = ++request.current;
    const saved = { ...selected, title: title.trim(), content, updated_at: Date.now() };
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${base}/${selected.id}`, { title, content });
      if (token === request.current) { setSelected(saved); setTitle(saved.title); list.reload(); }
    } catch (err) {
      if (token === request.current) setError((err as Error).message);
    } finally {
      if (token === request.current) { mutation.current = false; setBusy(false); }
    }
  }

  async function remove() {
    if (!selected || mutation.current) return;
    if (!window.confirm(`Delete "${selected.title}"? ${dirty ? "Unsaved changes will also be lost. " : ""}This cannot be undone.`)) return;
    mutation.current = true;
    const token = ++request.current;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`${base}/${selected.id}`);
      if (token === request.current) { setSelected(null); list.reload(); }
    } catch (err) {
      if (token === request.current) setError((err as Error).message);
    } finally {
      if (token === request.current) { mutation.current = false; setBusy(false); }
    }
  }

  function remember(input: HTMLTextAreaElement) {
    setRange({ start: input.selectionStart, end: input.selectionEnd });
  }

  function insert(resource: Resource) {
    if (busy || composing.current) return;
    apply(insertFileLink(content, range.start, range.end, workspaceId, resource, completion));
    setPicker(false);
    setDismissed(true);
  }

  function apply(result: { text: string; start: number; end: number }) {
    const input = textarea.current;
    if (!input) return;
    if (result.text.length > 100_000) { setError("Note content must be at most 100000 characters"); return; }
    setContent(result.text);
    setRange({ start: result.start, end: result.end });
    requestAnimationFrame(() => {
      if (textarea.current !== input) return;
      input.focus();
      input.setSelectionRange(result.start, result.end);
    });
  }

  function format(tool: MarkdownTool) {
    const input = textarea.current;
    if (!input || busy || composing.current) return;
    apply(editMarkdown(content, range.start, range.end, tool));
    setDismissed(true);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card title="Notes" actions={<GhostButton disabled={busy} onClick={() => {
        if (!allowDiscard()) return;
        ++request.current;
        setLoading(false);
        if (selected) open(selected, false);
        setCreating(true);
      }}>New note</GhostButton>}>
        {list.error ? <div role="alert"><ErrorText>{list.error}</ErrorText><GhostButton onClick={list.reload}>Retry list</GhostButton></div> : list.loading ? <Empty>Loading…</Empty> : !list.data?.notes.length ? <Empty>No notes.</Empty> : (
          <ul className="space-y-1">
            {list.data.notes.map(note => <li key={note.id}><button type="button" disabled={busy} aria-current={selected?.id === note.id ? "true" : undefined} onClick={() => select(note.id)} className={`w-full truncate rounded px-2 py-2 text-left text-sm hover:bg-gray-100 ${selected?.id === note.id ? "bg-gray-100 font-medium" : ""}`}>{note.title}</button></li>)}
          </ul>
        )}
      </Card>
      <Card title={selected ? title || "Untitled note" : "Notes"} actions={selected && (
        <div className="flex flex-wrap items-center gap-2">
          {(["view", "edit", "split"] as const).map(value => <GhostButton key={value} className={`min-h-11 min-w-11 px-2 ${mode === value ? "!border-gray-900 !text-gray-900" : "!border-transparent !text-gray-700"}`} disabled={busy} aria-label={`${value[0].toUpperCase()}${value.slice(1)} mode`} title={`${value[0].toUpperCase()}${value.slice(1)} mode`} aria-pressed={mode === value} onClick={() => { setMode(value); setPicker(false); setDismissed(true); }}><EditorIcon name={value} /></GhostButton>)}
          <Button className="min-h-11 min-w-11 px-2" aria-label="Save note" title="Save note" disabled={busy || !dirty || !title.trim()} onClick={save}><EditorIcon name="save" /></Button>
          <Button className="min-h-11 min-w-11 px-2" aria-label="Delete note" title="Delete note" variant="danger" disabled={busy} onClick={remove}><EditorIcon name="delete" /></Button>
        </div>
      )}>
        <div role="alert"><ErrorText>{error}</ErrorText>{failedId && <GhostButton onClick={() => select(failedId)}>Retry note</GhostButton>}</div>
        {loading ? <Empty>Loading note…</Empty> : !selected ? <Empty>Choose a note from the list, or create a new one.</Empty> : (
          <div className="space-y-3" aria-busy={busy}>
            <p role="status" className="text-xs text-gray-500">{dirty ? editing ? "Unsaved changes — choose Save to keep them." : "Preview of unsaved changes — not saved yet." : "All changes saved."}</p>
            <div className={mode === "split" ? "grid min-w-0 gap-4 xl:grid-cols-2" : "min-w-0"}>
            {editing && <div className="min-w-0 space-y-3">
              <Field label="Title"><Input value={title} disabled={busy} maxLength={200} onChange={event => setTitle(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEnded.current = Date.now(); }} /></Field>
              <div role="group" aria-label="Markdown formatting" className="flex flex-wrap gap-1">
                {markdownTools.map(([tool, label]) => <GhostButton key={tool} type="button" aria-label={label} title={label} disabled={busy} className="min-h-11 min-w-11 px-2" onMouseDown={event => event.preventDefault()} onClick={() => format(tool)}><EditorIcon name={tool} /></GhostButton>)}
                <GhostButton aria-label="Insert resource file" title="Insert resource file" aria-expanded={showFiles} disabled={busy} className="min-h-11 min-w-11 px-2" onMouseDown={event => event.preventDefault()} onClick={() => { setPicker(!picker); setQuery(""); setScope(projectId); setActiveFile(0); }}><EditorIcon name="file" /></GhostButton>
              </div>
              <Field label="Content (Markdown)">
                <textarea ref={textarea} rows={16} maxLength={100_000} value={content} disabled={busy} placeholder="Write Markdown…" className="min-w-0 w-full max-w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10" aria-autocomplete="list" aria-controls={showFiles ? "note-file-options" : undefined} aria-activedescendant={showFiles && files[activeIndex] ? `note-file-${activeIndex}` : undefined} onSelect={event => remember(event.currentTarget)} onBlur={event => remember(event.currentTarget)} onChange={event => { setContent(event.target.value); remember(event.target); setDismissed(false); setActiveFile(0); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEnded.current = Date.now(); }} onKeyDown={event => {
                  if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || (event.key === "Enter" && Date.now() - compositionEnded.current < 100)) return;
                  if (showFiles && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
                    if (event.key === "Escape") { event.preventDefault(); setPicker(false); setDismissed(true); return; }
                    if (!resources.loading && !resources.error && files.length) {
                      event.preventDefault();
                      if (event.key === "Enter") insert(files[activeIndex]);
                      else setActiveFile((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + files.length) % files.length);
                      return;
                    }
                  }
                  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
                  const tool = ({ b: "bold", i: "italic", k: "link" } as const)[event.key.toLowerCase() as "b" | "i" | "k"];
                  if (tool) { event.preventDefault(); format(tool); }
                }} />
              </Field>
              {showFiles && <section aria-label="Resource files" className="space-y-2 rounded-lg border border-gray-300 p-3" onKeyDown={event => {
                if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229 || (event.key === "Enter" && Date.now() - compositionEnded.current < 100)) return;
                if (event.key === "Escape") { event.preventDefault(); setPicker(false); setDismissed(true); textarea.current?.focus(); }
                if (event.target instanceof HTMLInputElement && files.length && !resources.loading && !resources.error) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActiveFile((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + files.length) % files.length); }
                  if (event.key === "Enter") { event.preventDefault(); insert(files[activeIndex]); }
                }
              }}>
                <div className="flex items-center gap-2">
                  <Field label="File tab"><select disabled={busy} className="max-w-full rounded border border-gray-300 p-2 text-sm" value={scope} onChange={event => { setScope(event.target.value); setActiveFile(0); }}>
                    <option value={projectId}>Current tab</option><option value="">All tabs</option>
                    {(projects.data?.projects ?? []).filter(project => project.workspace_id === workspaceId && project.id !== projectId).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select></Field>
                  <GhostButton aria-label="Close file picker" title="Close file picker" onClick={() => { setPicker(false); setDismissed(true); textarea.current?.focus(); }}><EditorIcon name="delete" /></GhostButton>
                </div>
                {picker && <Field label="Search files"><Input autoFocus value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setActiveFile(0); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEnded.current = Date.now(); }} aria-controls="note-file-options" aria-activedescendant={files[activeIndex] ? `note-file-${activeIndex}` : undefined} /></Field>}
                {resources.loading ? <p role="status">Loading files…</p> : resources.error ? <div role="alert"><ErrorText>{resources.error}</ErrorText><GhostButton onClick={resources.reload}>Retry files</GhostButton></div> : <>
                  {!files.length && <p role="status" className="text-sm text-gray-500">No uploaded files match. Try All tabs or another search.</p>}
                  <ul id="note-file-options" role="listbox" aria-label="Matching files" className="max-h-48 overflow-auto">
                    {files.map((file, index) => <li key={file.id} role="none"><button type="button" role="option" id={`note-file-${index}`} aria-selected={index === activeIndex} disabled={busy} className={`w-full break-words rounded p-2 text-left text-sm ${index === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"}`} onMouseDown={event => event.preventDefault()} onClick={() => insert(file)}>{file.name}<span className="ml-2 text-xs text-gray-500">{projects.data?.projects.find(project => project.id === file.project_id)?.name ?? "No tab"}</span></button></li>)}
                  </ul>
                </>}
              </section>}
              <p className="text-xs text-gray-500">Cmd/Ctrl+B: bold · I: italic · K: link. Files: type [label](query or [[query; ↑/↓ then Enter, or click. Escape closes hints.</p>
            </div>}
            {mode !== "edit" && <section aria-label="Markdown preview" className="min-w-0 rounded-lg border border-gray-200 p-3" onClick={event => {
              const anchor = event.target instanceof Element ? event.target.closest("a") : null;
              if (anchor?.getAttribute("href")?.startsWith("/api/workspaces/")) { event.preventDefault(); window.open(anchor.href, "_blank", "noopener,noreferrer"); }
            }}>{content ? <div className="markdown-body break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} /> : <Empty>This note is empty. Choose Edit to start writing.</Empty>}</section>}
            </div>
            {selected.updated_at && <p className="text-xs text-gray-400">Updated {fmtDateTime(selected.updated_at)}</p>}
          </div>
        )}
      </Card>
      {creating && <NewNoteDialog workspaceId={workspaceId} projectId={projectId} onClose={() => setCreating(false)} onSaved={note => {
        ++request.current;
        setCreating(false);
        open(note, true);
        list.reload();
      }} />}
    </div>
  );
}

function NewNoteDialog({ workspaceId, projectId, onClose, onSaved }: {
  workspaceId: string; projectId: string; onClose: () => void; onSaved: (note: Note) => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const pending = useRef(false);
  const composing = useRef(false);
  const compositionEnded = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function create() {
    if (pending.current || composing.current || !title.trim()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post(`/workspaces/${workspaceId}/notes`, { title, project_id: projectId });
      if (active.current) onSaved(result.note);
    } catch (err) {
      if (active.current) setError((err as Error).message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return <Modal open title="New note" onClose={() => {
    if (!pending.current && (!title.trim() || window.confirm("Discard this new note title?"))) onClose();
  }}>
    <div className="space-y-3">
      <Field label="Title"><Input value={title} maxLength={200} autoFocus disabled={busy} onChange={event => setTitle(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEnded.current = Date.now(); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229 || Date.now() - compositionEnded.current < 100) return;
        if (event.key === "Enter") { event.preventDefault(); create(); }
      }} /></Field>
      <div role="alert"><ErrorText>{error}</ErrorText></div>
      <Button disabled={busy || !title.trim()} onClick={create}>{busy ? "Creating…" : "Create note"}</Button>
    </div>
  </Modal>;
}

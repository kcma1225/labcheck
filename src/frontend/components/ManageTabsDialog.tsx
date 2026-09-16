import { useLayoutEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Button, ColorPicker, ErrorText, Field, Icon, Input, Modal, Select } from "./ui";
import { NewTabForm } from "./NewTabDialog";
import { tabColor } from "../lib/colors";
import type { Group, Project } from "../../shared/types";

const GROUP_MIME = "application/x-manage-group";
const PROJECT_MIME = "application/x-manage-project";

function startDrag(e: DragEvent, mime: string, id: string) {
  e.dataTransfer.setData(mime, id);
  e.dataTransfer.effectAllowed = "move";
}

interface Props {
  workspaceId: string;
  groups: Group[];
  projects: Project[];
  activeProjectId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function reorder<T extends { id: string }>(list: T[], draggedId: string, targetId: string): string[] {
  const ids = list.map((x) => x.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedId);
  return ids;
}

export function duplicateGroup(groups: Group[], name: string, id?: string) {
  return groups.some(g => g.id !== id && g.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export function ManageTabsDialog({ workspaceId, groups, projects, activeProjectId, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const base = `/w/${workspaceId}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [creatingTab, setCreatingTab] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editing, setEditing] = useState<{ kind: "groups" | "projects"; id: string } | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [moveGroup, setMoveGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const group = groups.find(g => g.id === selected);
  const ungrouped = projects.filter(p => !p.group_id || !groups.some(g => g.id === p.group_id));
  const tabs = selected === "" ? ungrouped : projects.filter(p => p.group_id === selected);

  useLayoutEffect(() => {
    if (selected && !groups.some(g => g.id === selected)) {
      setSelected(null);
      setCreatingTab(false);
      setEditing(null);
    }
  }, [groups, selected]);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selected, creatingTab, creatingGroup, editing]);

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function addGroup() {
    const name = newGroupName.trim();
    if (pending.current || !name) return;
    if (duplicateGroup(groups, name)) { setError("A group with this name already exists."); return; }
    const ok = await run(() => api.post(`/workspaces/${workspaceId}/groups`, { name, color: newGroupColor }));
    if (ok) { setNewGroupName(""); setNewGroupColor(null); setCreatingGroup(false); }
  }

  function back() {
    if (busy) return;
    setError(null);
    if (editing) setEditing(null);
    else if (creatingTab) setCreatingTab(false);
    else if (creatingGroup) { setCreatingGroup(false); setNewGroupName(""); setNewGroupColor(null); }
    else setSelected(null);
  }

  function edit(kind: "groups" | "projects", item: Group | Project) {
    setName(item.name);
    setColor(item.color);
    setMoveGroup("group_id" in item ? item.group_id ?? "" : "");
    setError(null);
    setEditing({ kind, id: item.id });
  }

  async function save() {
    if (!editing || !name.trim() || pending.current) return;
    if (editing.kind === "groups" && duplicateGroup(groups, name, editing.id)) {
      setError("A group with this name already exists."); return;
    }
    const ok = await run(() => api.patch(`/workspaces/${workspaceId}/${editing.kind}/${editing.id}`, {
      name: name.trim(), color, ...(editing.kind === "projects" ? { group_id: moveGroup || null } : {}),
    }));
    if (ok) setEditing(null);
  }

  async function remove(kind: "groups" | "projects", item: Group | Project) {
    const message = kind === "groups"
      ? `Remove the "${item.name}" group? Tabs inside stay — they'll just be ungrouped.`
      : `Remove the "${item.name}" tab? Its todos, notes, events and resources are kept — they'll just no longer be grouped under this tab.`;
    if (!window.confirm(message)) return;
    const ok = await run(() => api.delete(`/workspaces/${workspaceId}/${kind}/${item.id}`));
    if (ok && kind === "projects" && item.id === activeProjectId) navigate(base);
  }

  function rows(kind: "groups" | "projects", items: (Group | Project)[]) {
    const mime = kind === "groups" ? GROUP_MIME : PROJECT_MIME;
    const all = kind === "groups" ? groups : projects;
    const move = (id: string, target: string) => run(() => api.post(`/workspaces/${workspaceId}/${kind}/reorder`, { ids: reorder(all, id, target) }));
    return <div className="space-y-3">{items.map((item, index) => (
      <div key={item.id} draggable={!busy} onDragStart={e => startDrag(e, mime, item.id)} onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault();
        const id = e.dataTransfer.getData(mime);
        if (items.some(i => i.id === id)) void move(id, item.id);
      }} className="rounded-lg border border-gray-200 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tabColor(item) }} />
          {kind === "groups" ? <button disabled={busy} onClick={() => { setSelected(item.id); setError(null); }} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium">
            <span className="min-w-0 flex-1 break-words">{item.name}</span><span aria-hidden="true" className="shrink-0 self-center">→</span>
          </button> : <span className="min-w-0 flex-1 break-words text-sm font-medium">{item.name}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => edit(kind, item)} aria-label={`Edit ${item.name}`}>Edit</Button>
          <Button variant="ghost" disabled={busy || index === 0} onClick={() => move(item.id, items[index - 1].id)} aria-label={`Move ${item.name} up`}>↑</Button>
          <Button variant="ghost" disabled={busy || index === items.length - 1} onClick={() => move(item.id, items[index + 1].id)} aria-label={`Move ${item.name} down`}>↓</Button>
          <Button variant="danger" disabled={busy} onClick={() => remove(kind, item)} aria-label={`Remove ${item.name}`}><Icon name="trash" /></Button>
        </div>
      </div>
    ))}</div>;
  }

  const newGroupForm = (
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void addGroup(); }} onKeyDown={e => {
      if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
    }}>
      <Field label="Name">
        <Input autoFocus disabled={busy} value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name" maxLength={100} />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">Color</span>
        <ColorPicker mobileSelect label="New group color" value={newGroupColor} onChange={setNewGroupColor} disabled={busy} />
      </div>
      <Button type="submit" disabled={busy || !newGroupName.trim()}>{busy ? "Creating…" : "Create group"}</Button>
    </form>
  );

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Manage">
      <div className="space-y-5 [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">
        {(selected !== null || editing || creatingGroup) && <Button variant="ghost" disabled={busy} onClick={back}>← {editing || creatingTab || creatingGroup ? "Back (discard draft)" : "Groups"}</Button>}
        {selected === null && !editing && !creatingGroup ? (
          <div className="flex items-center justify-between gap-3">
            <h3 ref={heading} tabIndex={-1} className="break-words text-base font-semibold">Groups</h3>
            <Button onClick={() => setCreatingGroup(true)} disabled={busy}><Icon name="plus" />New group</Button>
          </div>
        ) : (
          <h3 ref={heading} tabIndex={-1} className={`break-words text-base font-semibold ${creatingTab || creatingGroup ? "sr-only" : ""}`}>{editing ? `Edit ${editing.kind === "groups" ? "group" : "tab"}` : creatingTab ? "New tab" : creatingGroup ? "New group" : group?.name ?? "Ungrouped"}</h3>
        )}
        {editing ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }} onKeyDown={e => {
          if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
        }}>
          <Field label="Name"><Input value={name} disabled={busy} onChange={e => setName(e.target.value)} maxLength={100} /></Field>
          <ColorPicker mobileSelect label="Edit color" value={color} onChange={setColor} disabled={busy} />
          {editing.kind === "projects" && <Field label="Move to group"><Select disabled={busy} value={moveGroup} onChange={e => setMoveGroup(e.target.value)}>
            <option value="">Ungrouped</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select></Field>}
          <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
        </form> : creatingTab && group ? <NewTabForm key={group.id} workspaceId={workspaceId} group={group} onBusy={setBusy} onCreated={() => { onChanged(); setCreatingTab(false); }} /> : creatingGroup ? newGroupForm : selected === null ? <>
          {rows("groups", groups)}
          {ungrouped.length > 0 && <Button variant="ghost" disabled={busy} className="w-full justify-between" onClick={() => setSelected("")}>Ungrouped ({ungrouped.length}) <span aria-hidden="true">→</span></Button>}
        </> : <>
          {group ? <Button onClick={() => setCreatingTab(true)} disabled={busy}><Icon name="plus" />New tab</Button> : <p className="text-sm text-gray-500">Existing ungrouped tabs can be edited or moved. Select a group to create new tabs.</p>}
          {tabs.length ? rows("projects", tabs) : <p className="text-sm text-gray-500">No tabs in this group yet.</p>}
        </>}
        <div role="alert"><ErrorText>{error}</ErrorText></div>
      </div>
    </Modal>
  );
}

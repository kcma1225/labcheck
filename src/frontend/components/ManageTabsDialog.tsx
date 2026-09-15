import { useState } from "react";
import type { DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Button, ColorPicker, ErrorText, Icon, Input, Modal, Select } from "./ui";
import type { Group, Project } from "../../shared/types";

// Drag id travels via the native dataTransfer payload, not React state — state
// set in onDragStart isn't guaranteed to have re-rendered (and so be visible
// in a fresh closure) by the time onDrop fires moments later.
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
  /** The tab currently open, if any — deleting it navigates back to the Dashboard. */
  activeProjectId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function reorder<T extends { id: string }>(list: T[], draggedId: string, targetId: string): string[] {
  const ids = list.map((x) => x.id);
  if (draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedId);
  return ids;
}

export function ManageTabsDialog({ workspaceId, groups, projects, activeProjectId, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const base = `/w/${workspaceId}`;

  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  async function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    const ok = await run(() => api.post(`/workspaces/${workspaceId}/groups`, { name }));
    setCreatingGroup(false);
    if (ok) setNewGroupName("");
  }

  function removeGroup(g: Group) {
    if (window.confirm(`Remove the "${g.name}" group? Tabs inside stay — they'll just be ungrouped.`)) {
      run(() => api.delete(`/workspaces/${workspaceId}/groups/${g.id}`));
    }
  }

  function removeProject(p: Project) {
    if (
      window.confirm(
        `Remove the "${p.name}" tab? Its todos, notes, events and resources are kept — they'll just no longer be grouped under this tab.`,
      )
    ) {
      run(() => api.delete(`/workspaces/${workspaceId}/projects/${p.id}`)).then(() => {
        if (p.id === activeProjectId) navigate(base);
      });
    }
  }

  return (
    <Modal open onClose={onClose} title="Manage tabs & groups">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Groups</h3>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No groups yet.</p>
          ) : (
            <div className="space-y-1">
              {groups.map((g) => (
                <div
                  key={g.id}
                  draggable
                  onDragStart={(e) => startDrag(e, GROUP_MIME, g.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData(GROUP_MIME);
                    if (draggedId) {
                      const ids = reorder(groups, draggedId, g.id);
                      run(() => api.post(`/workspaces/${workspaceId}/groups/reorder`, { ids }));
                    }
                  }}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-1.5"
                >
                  <span className="shrink-0 cursor-grab text-gray-300" aria-hidden="true">
                    <Icon name="grip" className="h-4 w-4" />
                  </span>
                  <ColorPicker
                    compact
                    value={g.color}
                    onChange={(color) => run(() => api.patch(`/workspaces/${workspaceId}/groups/${g.id}`, { color }))}
                  />
                  <input
                    key={`${g.id}-${g.name}`}
                    defaultValue={g.name}
                    maxLength={100}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== g.name) {
                        run(() => api.patch(`/workspaces/${workspaceId}/groups/${g.id}`, { name }));
                      } else {
                        e.target.value = g.name;
                      }
                    }}
                    className="min-w-0 basis-32 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-gray-200 focus:border-gray-300 focus:outline-none"
                  />
                  <button
                    onClick={() => removeGroup(g)}
                    aria-label={`Remove ${g.name}`}
                    className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                // Skip Enter while an IME composition is still active (e.g. confirming
                // Chinese/Japanese/Korean candidates) — that Enter selects the
                // candidate, it isn't the user asking to submit. isComposing is the
                // spec-correct check; keyCode 229 covers older Safari/WebKit, which
                // reports it for the same confirming keystroke instead of isComposing.
                if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return;
                addGroup();
              }}
              placeholder="New group name"
              maxLength={100}
            />
            <Button type="button" onClick={addGroup} disabled={creatingGroup || !newGroupName.trim()}>
              Add
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tabs</h3>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-400">No tabs yet.</p>
          ) : (
            <div className="space-y-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => startDrag(e, PROJECT_MIME, p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData(PROJECT_MIME);
                    if (draggedId) {
                      const ids = reorder(projects, draggedId, p.id);
                      run(() => api.post(`/workspaces/${workspaceId}/projects/reorder`, { ids }));
                    }
                  }}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-1.5"
                >
                  <span className="shrink-0 cursor-grab text-gray-300" aria-hidden="true">
                    <Icon name="grip" className="h-4 w-4" />
                  </span>
                  <ColorPicker
                    compact
                    value={p.color}
                    onChange={(color) => run(() => api.patch(`/workspaces/${workspaceId}/projects/${p.id}`, { color }))}
                  />
                  <input
                    key={`${p.id}-${p.name}`}
                    defaultValue={p.name}
                    maxLength={100}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== p.name) {
                        run(() => api.patch(`/workspaces/${workspaceId}/projects/${p.id}`, { name }));
                      } else {
                        e.target.value = p.name;
                      }
                    }}
                    className="min-w-0 basis-32 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-gray-200 focus:border-gray-300 focus:outline-none"
                  />
                  <div className="w-28 shrink-0">
                    <Select
                      value={p.group_id ?? ""}
                      onChange={(e) =>
                        run(() =>
                          api.patch(`/workspaces/${workspaceId}/projects/${p.id}`, {
                            group_id: e.target.value || null,
                          }),
                        )
                      }
                      className="py-1 text-xs"
                    >
                      <option value="">No group</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <button
                    onClick={() => removeProject(p)}
                    aria-label={`Remove ${p.name}`}
                    className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

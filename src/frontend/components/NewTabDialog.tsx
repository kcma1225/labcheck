import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { Button, ColorPicker, ErrorText, Field, Input, Modal, Select } from "./ui";
import type { Group } from "../../shared/types";

export function NewTabDialog({
  workspaceId,
  groups,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  groups: Group[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/workspaces/${workspaceId}/projects`, {
        name: name.trim(),
        group_id: groupId || null,
        color,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New tab">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ML Course, Thesis A"
            maxLength={100}
            autoFocus
          />
        </Field>
        <Field label="Group (optional)">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">Color</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create tab"}
        </Button>
      </form>
    </Modal>
  );
}

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { tabColor } from "../lib/colors";
import { Button, ColorPicker, ErrorText, Field, Input } from "./ui";
import type { Group } from "../../shared/types";

export function NewTabForm({ workspaceId, group, onCreated, onBusy }: {
  workspaceId: string;
  group: Group;
  onCreated: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending.current || !name.trim() || !group.id.trim()) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError(null);
    try {
      await api.post(`/workspaces/${workspaceId}/projects`, {
        name: name.trim(), group_id: group.id, color,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={(e) => {
      if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
    }} className="space-y-4">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-600">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tabColor(group) }} />
        <span className="min-w-0 break-words">{group.name}</span>
      </div>
      <Field label="Name">
        <Input autoFocus disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ML Course, Thesis A" maxLength={100} />
      </Field>
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">Color</span>
        <ColorPicker mobileSelect label="New tab color" value={color} onChange={setColor} disabled={busy} />
      </div>
      <div role="alert"><ErrorText>{error}</ErrorText></div>
      <Button type="submit" disabled={busy || !name.trim() || !group.id.trim()}>{busy ? "Creating…" : "Create tab"}</Button>
    </form>
  );
}

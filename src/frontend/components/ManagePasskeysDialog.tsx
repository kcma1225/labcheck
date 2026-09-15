import { useState } from "react";
import type { FormEvent } from "react";
import { useAsync } from "../hooks/useAsync";
import { listPasskeys, registerPasskey, removePasskey } from "../lib/webauthn";
import { fmtDate } from "../lib/date";
import { Button, Empty, ErrorText, Field, Icon, Input, Modal } from "./ui";

export function ManagePasskeysDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(() => listPasskeys(workspaceId), [workspaceId]);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await registerPasskey(workspaceId, name.trim());
      setName("");
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await removePasskey(workspaceId, id);
    reload();
  }

  return (
    <Modal open onClose={onClose} title="Passkeys">
      <p className="mb-3 text-xs text-gray-500">
        Anyone on the team can add their own passkey here to unlock this workspace without typing
        the password — from a device they already trust (Face ID, Touch ID, Windows Hello, or a
        security key).
      </p>

      {error && <ErrorText>{error}</ErrorText>}
      {loading ? (
        <Empty>Loading…</Empty>
      ) : data!.length === 0 ? (
        <Empty>No passkeys yet.</Empty>
      ) : (
        <ul className="mb-4 divide-y divide-gray-100">
          {data!.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <Icon name="key" className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-400">
                  Added {fmtDate(p.created_at)}
                  {p.last_used_at ? ` · last used ${fmtDate(p.last_used_at)}` : ""}
                </div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="text-xs text-gray-400 hover:text-red-600"
                aria-label={`Remove passkey ${p.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex items-end gap-2 border-t border-gray-100 pt-3">
        <div className="flex-1">
          <Field label="Add a passkey for this device">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kai's MacBook"
              maxLength={100}
            />
          </Field>
        </div>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
      <ErrorText>{formError}</ErrorText>
    </Modal>
  );
}

import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { CopyButton } from "../components/CopyButton";
import { Header } from "../components/Header";
import { ThemeToggleIcon } from "../components/ThemeToggle";
import { useAsync } from "../hooks/useAsync";
import { useMobileThemeOverride } from "../hooks/useTheme";
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Icon,
  Input,
  Modal,
} from "../components/ui";
import { fmtDate } from "../lib/date";
import type { AdminWorkspaceSummary } from "../../shared/types";

export function AdminCreateWorkspace() {
  const session = useAsync<{ authenticated: boolean }>(() => api.get("/admin/session"), []);
  const systemTheme = useMobileThemeOverride(true);

  return (
    <div className="app-shell min-h-dvh bg-gray-50">
      <div className="safe-overlay mx-auto max-w-2xl">
        <Header end={!systemTheme && <ThemeToggleIcon />} />
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        {session.loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : session.data?.authenticated ? (
          <Console />
        ) : (
          <LoginCard onDone={session.reload} />
        )}
      </main>
    </div>
  );
}

function LoginCard({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/login", { adminSecret: secret });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><button type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"><Icon name="chevron-left" /></button><span>Enter admin secret</span></span>}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">
          Unlock once — the console stays open in this browser for 7 days.
        </p>
        <Input
          type="password"
          autoFocus
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="ADMIN_SECRET"
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !secret}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </Card>
  );
}

function Console() {
  const list = useAsync<{ workspaces: AdminWorkspaceSummary[] }>(() => api.get("/admin/workspaces"), []);

  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; url: string } | null>(null);
  const [editing, setEditing] = useState<AdminWorkspaceSummary | null>(null);

  async function logout() {
    await api.post("/admin/logout");
    window.location.reload();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post("/admin/workspaces", { name, password: pw });
      setCreated({ name: r.name, url: r.url });
      setName("");
      setPw("");
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ws: AdminWorkspaceSummary) {
    if (!window.confirm(`Delete "${ws.name}" and all of its data? This cannot be undone.`)) return;
    await api.delete(`/admin/workspaces/${ws.id}`);
    list.reload();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Workspaces</h1>
        <button onClick={logout} className="text-xs text-gray-500 underline hover:text-gray-800">
          Log out
        </button>
      </div>

      <Card title="Create a workspace">
        <form onSubmit={create} className="space-y-3">
          <Field label="Workspace name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Workspace password">
            <Input
              type="text"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="any length"
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy || !name || !pw}>
            {busy ? "Creating…" : "Create workspace"}
          </Button>
        </form>

        {created && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{created.name}</span> created. Share this link and the
              password:
            </p>
            <CopyRow value={created.url} />
          </div>
        )}
      </Card>

      <Card title={`All workspaces${list.data ? ` (${list.data.workspaces.length})` : ""}`}>
        {list.loading ? (
          <Empty>Loading…</Empty>
        ) : (list.data?.workspaces.length ?? 0) === 0 ? (
          <Empty>No workspaces yet.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.data!.workspaces.map((ws) => (
              <li key={ws.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <a href={ws.url} className="block truncate text-sm font-medium text-gray-800 hover:underline" title={`Open ${ws.name}`}>
                    {ws.name}
                  </a>
                  <div className="truncate text-xs text-gray-400">
                    {ws.url} · created {fmtDate(ws.created_at)}
                  </div>
                </div>
                <CopyButton value={ws.url} label="Copy workspace URL" iconOnly />
                <button
                  type="button"
                  onClick={() => setEditing(ws)}
                  aria-label="Edit workspace"
                  title="Edit workspace"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Icon name="edit" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(ws)}
                  aria-label="Remove workspace"
                  title="Remove workspace"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <WorkspaceEditDialog
          workspace={editing}
          onClose={() => setEditing(null)}
          onChanged={(workspace) => {
            setEditing(workspace);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function WorkspaceEditDialog({
  workspace,
  onClose,
  onChanged,
}: {
  workspace: AdminWorkspaceSummary;
  onClose: () => void;
  onChanged: (workspace: AdminWorkspaceSummary) => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [rotateBusy, setRotateBusy] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameBusy(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await api.patch(`/admin/workspaces/${workspace.id}`, { name });
      setNameSaved(true);
      onChanged({ ...workspace, name });
    } catch (err) {
      setNameError((err as Error).message);
    } finally {
      setNameBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    setPwSaved(false);
    try {
      await api.patch(`/admin/workspaces/${workspace.id}/password`, { password: newPassword });
      setPwSaved(true);
      setNewPassword("");
    } catch (err) {
      setPwError((err as Error).message);
    } finally {
      setPwBusy(false);
    }
  }

  async function rotateUrl() {
    if (!window.confirm("Regenerate workspace URL? Old URL will stop working and all workspace sessions will be revoked.")) return;
    setRotateBusy(true);
    setRotateError(null);
    try {
      const updated = await api.post(`/admin/workspaces/${workspace.id}/rotate-url`) as AdminWorkspaceSummary;
      onChanged(updated);
    } catch (err) {
      setRotateError((err as Error).message);
    } finally {
      setRotateBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit "${workspace.name}"`}>
      <div className="space-y-5">
        <div className="space-y-2">
          <Field label="Workspace URL">
            <CopyRow value={workspace.url} />
          </Field>
          <Button type="button" onClick={rotateUrl} disabled={rotateBusy}>
            {rotateBusy ? "Regenerating…" : "Regenerate workspace URL"}
          </Button>
          <ErrorText>{rotateError}</ErrorText>
        </div>

        <form onSubmit={saveName} className="space-y-2 border-t border-gray-100 pt-4">
          <Field label="Workspace name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
              maxLength={100}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={nameBusy || !name.trim() || name.trim() === workspace.name}>
              <Icon name="edit" className="h-3.5 w-3.5" />
              {nameBusy ? "Saving…" : "Save name"}
            </Button>
            {nameSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
          <ErrorText>{nameError}</ErrorText>
        </form>

        <form onSubmit={resetPassword} className="space-y-2 border-t border-gray-100 pt-4">
          <Field label="New workspace password">
            <Input
              type="text"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwSaved(false);
              }}
              placeholder="any length"
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="danger" disabled={pwBusy || !newPassword}>
              <Icon name="key" className="h-3.5 w-3.5" />
              {pwBusy ? "Resetting…" : "Reset password"}
            </Button>
            {pwSaved && <span className="text-xs text-green-600">Password updated</span>}
          </div>
          <ErrorText>{pwError}</ErrorText>
        </form>
      </div>
    </Modal>
  );
}

function CopyRow({ value }: { value: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { checkPasskeyAvailable, loginWithPasskey, passkeySupported } from "../lib/webauthn";
import { ThemeToggleIcon } from "../components/ThemeToggle";
import { Button, ErrorText, GhostButton, Icon, Input } from "../components/ui";

export function WorkspaceUnlock({
  workspaceId,
  onUnlocked,
}: {
  workspaceId: string;
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyReady, setPasskeyReady] = useState(false);

  useEffect(() => {
    if (!passkeySupported()) return;
    checkPasskeyAvailable(workspaceId).then(setPasskeyReady);
  }, [workspaceId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/workspaces/${workspaceId}/unlock`, { password });
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function submitWithPasskey() {
    setBusy(true);
    setError(null);
    try {
      await loginWithPasskey(workspaceId);
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="safe-overlay flex min-h-dvh items-center justify-center bg-gray-50">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Enter Workspace</h1>
            <p className="mt-1 text-xs text-gray-500">This workspace is password protected.</p>
          </div>
          <ThemeToggleIcon className="p-1.5" />
        </div>
        <div className="space-y-1">
          <label htmlFor="workspace-password" className="text-xs font-medium text-gray-600">Password</label>
          <Input
            id="workspace-password"
            autoComplete="current-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !password} className="w-full">
          {busy ? "Checking…" : "Enter"}
        </Button>
        {passkeyReady && (
          <>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="h-px flex-1 bg-gray-200" />
              or
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <GhostButton type="button" onClick={submitWithPasskey} disabled={busy} className="w-full justify-center">
              <Icon name="key" className="h-3.5 w-3.5" />
              Sign in with a passkey
            </GhostButton>
          </>
        )}
      </form>
    </div>
  );
}

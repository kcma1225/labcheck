import { useEffect, useState } from "react";
import { usePwaState } from "../hooks/usePwa";
import {
  applyUpdate,
  disablePush,
  enablePush,
  getPushSubscription,
  promptInstall,
  pushSupported,
  sendTestPush,
} from "../lib/pwa";
import { GhostButton, Icon } from "./ui";

/** Shown wherever the PWA state is relevant — a slim "install this app" affordance. */
export function InstallButton({ className = "" }: { className?: string }) {
  const state = usePwaState();
  if (!state.installPrompt || state.installed) return null;
  return (
    <GhostButton onClick={() => promptInstall()} className={className}>
      <Icon name="download" className="h-3.5 w-3.5" />
      Install app
    </GhostButton>
  );
}

/** A slim top banner: appears once a new service worker has installed and is waiting to activate. */
export function UpdateBanner() {
  const state = usePwaState();
  if (!state.updateAvailable) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-gray-900 px-4 py-1.5 text-xs text-white">
      A new version is available.
      <button onClick={applyUpdate} className="font-semibold underline underline-offset-2">
        Reload to update
      </button>
    </div>
  );
}

/** Push notification opt-in for one workspace — subscriptions are workspace-scoped, not per-user. */
export function NotificationsToggle({ workspaceId, className = "" }: { workspaceId: string; className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (pushSupported()) {
      getPushSubscription().then((sub) => {
        if (!cancelled) {
          setEnabled(!!sub);
          setChecked(true);
        }
      });
    } else {
      setChecked(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pushSupported() || !checked) return null;

  async function toggle() {
    setBusy(true);
    setStatus(null);
    try {
      if (enabled) {
        await disablePush(workspaceId);
        setEnabled(false);
      } else {
        await enablePush(workspaceId);
        setEnabled(true);
      }
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await sendTestPush(workspaceId);
      setStatus(`Sent to ${res.sent}/${res.total} device(s)`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
      >
        <Icon name={enabled ? "bell" : "bell-off"} className="h-3.5 w-3.5 shrink-0" />
        {enabled ? "Notifications on" : "Enable notifications"}
      </button>
      {enabled && (
        <button
          onClick={test}
          disabled={busy}
          className="w-full px-3 pb-1 text-left text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          Send test notification
        </button>
      )}
      {status && <div className="px-3 pb-1 text-xs text-gray-400">{status}</div>}
    </div>
  );
}

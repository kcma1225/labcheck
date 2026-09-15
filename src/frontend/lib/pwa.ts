// Service worker registration + a small pub/sub layer the UI reads from
// (install prompt availability, update-available banner, push subscription state).

import { api } from "../api/client";

type Listener = () => void;

const state = {
  installPrompt: null as BeforeInstallPromptEvent | null,
  installed: false,
  updateAvailable: false,
};
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function subscribePwaState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaState() {
  return state;
}

// Minimal ambient type — 'beforeinstallprompt' isn't in lib.dom.d.ts.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.installPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    state.installed = true;
    state.installPrompt = null;
    emit();
  });

  // Background-sync fallback for browsers without the Background Sync API
  // (Safari/iOS): flush the offline mutation queue as soon as we're back online.
  window.addEventListener("online", () => {
    navigator.serviceWorker.controller?.postMessage({ type: "FLUSH_QUEUE_NOW" });
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "queue-flushed") emit();
  });

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            state.updateAvailable = true;
            emit();
          }
        });
      });
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  });
}

export async function promptInstall(): Promise<void> {
  if (!state.installPrompt) return;
  await state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  emit();
}

export function applyUpdate(): void {
  navigator.serviceWorker.controller?.postMessage?.({ type: "SKIP_WAITING" });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
}

// --- push notifications ------------------------------------------------------

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush(workspaceId: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const { publicKey } = await api.get(`/workspaces/${workspaceId}/push/vapid-public-key`);
  if (!publicKey) throw new Error("Push notifications aren't configured on this deployment");

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
  });

  const json = sub.toJSON();
  await api.post(`/workspaces/${workspaceId}/push/subscribe`, {
    endpoint: json.endpoint,
    keys: json.keys,
  });
  return sub;
}

export async function disablePush(workspaceId: string): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  await sub.unsubscribe();
  await api.post(`/workspaces/${workspaceId}/push/unsubscribe`, { endpoint: sub.endpoint });
}

export async function sendTestPush(workspaceId: string): Promise<{ sent: number; total: number }> {
  return api.post(`/workspaces/${workspaceId}/push/test`);
}

function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const pad = base64url.length % 4 === 0 ? "" : "=".repeat(4 - (base64url.length % 4));
  const base64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

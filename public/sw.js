// Graduate Research Workspace — service worker.
// Hand-rolled (no Workbox) so each resource type gets an explicit, auditable
// caching strategy. Bump these version suffixes to force old caches out on a
// deploy that changes what's precached.
const STATIC_CACHE = "static-v3";
const API_CACHE = "api-v2";
const FILE_CACHE = "files-v2";
const CACHES = [STATIC_CACHE, API_CACHE, FILE_CACHE];

const SHELL_KEY = "/index.html";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

// --- install / activate ------------------------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Individually, not cache.addAll() — addAll is all-or-nothing, so one bad
      // URL (a redirect, a 404) would silently leave the whole precache empty.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const res = await fetch(url, { cache: "reload" });
          if (res.ok) await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// --- fetch: one strategy per resource type -----------------------------------

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method !== "GET") {
    if (isQueueableMutation(url)) event.respondWith(handleMutation(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // Vite's build output is content-hashed and immutable — safe to cache-first forever.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  if (/\/api\/workspaces\/[^/]+\/files\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, FILE_CACHE));
    return;
  }

  // Workspace data — prefer live data, but fall back to the last-seen response
  // so the app stays usable (read-only) offline.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // Icons, manifest, favicon, etc.
  event.respondWith(cacheFirst(req, STATIC_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function networkFirstNavigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(SHELL_KEY, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match(SHELL_KEY)) || (await cache.match(OFFLINE_URL)) || fetch(OFFLINE_URL);
  }
}

// --- background sync: queue mutations made while offline ---------------------

function isQueueableMutation(url) {
  if (!url.pathname.startsWith("/api/workspaces/")) return false;
  if (/\/(unlock|lock)$/.test(url.pathname)) return false;
  if (url.pathname.includes("/push/")) return false;
  return true;
}

async function handleMutation(req) {
  try {
    return await fetch(req.clone());
  } catch {
    await queueRequest(req);
    return new Response(JSON.stringify({ ok: true, queued: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const QUEUE_DB = "pwa-mutation-queue";
const QUEUE_STORE = "requests";

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueRequest(request) {
  const db = await openQueueDb();
  const body = await request.clone().blob();
  const entry = {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body: body.size > 0 ? body : null,
    createdAt: Date.now(),
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  if (self.registration.sync) {
    try {
      await self.registration.sync.register("flush-mutation-queue");
    } catch {
      // Background Sync unsupported/denied (Safari, some Firefox builds) —
      // the page's 'online' listener triggers FLUSH_QUEUE_NOW as a fallback.
    }
  }
  notifyClients({ type: "queue-updated" });
}

async function flushQueue() {
  const db = await openQueueDb();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const entry of all) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        credentials: "include",
      });
      if (res.status >= 500) break; // transient server issue — stop, retry later
      await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).delete(entry.id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      break; // still offline — stop, retry later
    }
  }
  db.close();
  notifyClients({ type: "queue-flushed" });
}

async function notifyClients(msg) {
  const clientsArr = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clientsArr) c.postMessage(msg);
}

self.addEventListener("sync", (event) => {
  if (event.tag === "flush-mutation-queue") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "FLUSH_QUEUE_NOW") event.waitUntil(flushQueue());
});

// --- push notifications -------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = { title: "Research Workspace", body: "You have an update.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

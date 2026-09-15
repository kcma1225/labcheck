# PWA audit checklist — Graduate Research Workspace

How to (re-)verify the PWA implementation added in `public/manifest.webmanifest`,
`public/sw.js`, `src/frontend/lib/pwa.ts`, and the Web Push routes under
`src/worker/routes/push.ts`. Re-run this after any change to those files.

## Running Lighthouse

Audit the built SPA through the Node server so static serving matches production,
not Vite's development server. Use an isolated local PostgreSQL database and file
storage with test-only secrets in `.env`; set `PUBLIC_ORIGIN=http://localhost:8787`.
Never use production resources for mutable QA. Checklist statuses below are historical
implementation notes, not verification of the current deployment.

```bash
npm run build
npm start
# in another terminal:
npx lighthouse http://localhost:8787 --view --only-categories=pwa,performance,accessibility,best-practices
```

Or from Chrome DevTools directly against that URL: **Lighthouse tab → Categories:
Progressive Web App → Analyze page load**. Test the **unlocked** dashboard view,
not just the password gate — that's the page real usage lives on.

## Installability

| Check | Status | Notes |
|---|---|---|
| Manifest present, valid JSON, linked from `<head>` | ✅ | `index.html` → `<link rel="manifest" href="/manifest.webmanifest">` |
| `short_name`, `name`, `start_url`, `display` set | ✅ | `display: "standalone"` |
| Icons: 192×192 and 512×512, `purpose: "any"` | ✅ | `public/icons/icon-192.png`, `icon-512.png` |
| Maskable icon (512×512, safe-zone padded) | ✅ | `public/icons/icon-maskable-512.png` — logo scaled to ~78% with margin |
| Served over HTTPS (or localhost) | Verify per deployment | Configure a TLS reverse proxy for production; local `http://localhost` is exempt |
| `theme_color` matches `<meta name="theme-color">` | ✅ | Both `#111827` |
| Service worker registered with a `fetch` handler | ✅ | `public/sw.js` |
| No console errors during load | ⚠️ verify per deploy | Not something a checklist can assert statically |

## Service worker / offline

| Check | Status | Notes |
|---|---|---|
| App shell (`/index.html`) precached at install | ✅ | Verified: `caches.open('static-v2')` contains `/index.html` after first install |
| Custom offline fallback page | ✅ | `public/offline.html`, precached, served when the shell itself isn't cached |
| Static assets (`/assets/*`) cache-first | ✅ | Vite content-hashes these — safe to cache forever |
| API GETs network-first with cache fallback | ✅ | Read-only access continues offline with last-seen data |
| File downloads (PDFs/images) stale-while-revalidate | ✅ | `/api/workspaces/*/files/*` |
| Old cache versions cleaned up on activate | ✅ | Bump `STATIC_CACHE`/`API_CACHE`/`FILE_CACHE` suffixes to force this |
| Literal `/offline.html` response without redirects | Verify after static-serving changes | `src/worker/server.ts` serves the file directly; redirects can prevent offline precaching |

## Background Sync

| Check | Status | Notes |
|---|---|---|
| Offline mutations (POST/PATCH/DELETE to `/api/workspaces/*`) are queued | ✅ | `public/sw.js` `queueRequest()`, IndexedDB-backed |
| Queue flushed via Background Sync API where supported | ✅ | Chrome/Edge/Android — `sync` event, tag `flush-mutation-queue` |
| Fallback flush when Background Sync is unsupported (Safari/iOS, some Firefox) | ✅ | `window.addEventListener('online', ...)` posts `FLUSH_QUEUE_NOW` to the SW |
| `/unlock`, `/lock`, `/push/*` excluded from queueing | ✅ | Session-sensitive — shouldn't silently replay later |

## Push notifications

| Check | Status | Notes |
|---|---|---|
| VAPID key pair configured | Verify operator configuration | Runtime environment: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_JWK` secret, and `VAPID_SUBJECT`; see `.env.example` |
| Subscribe/unsubscribe/test routes | ✅ | `src/worker/routes/push.ts` |
| Web Push encryption (RFC 8291/8188) + VAPID (RFC 8292) | Implemented | `src/worker/lib/webPush.ts` uses native Web Crypto on Node |
| Crypto correctness | ✅ verified | Independently decrypted the Worker's real encrypted output with a separate Node-native implementation and confirmed the plaintext matched exactly; VAPID JWT signature verified against the known public key. See git history / session notes for the verification script. |
| Reminder scheduler | Implemented; verify delivery separately | `src/worker/server.ts` runs `src/worker/lib/reminders.ts` on startup and every 30 minutes, with overlap prevention and a PostgreSQL advisory lock |
| Expired/gone subscriptions cleaned up | ✅ | 404/410 responses delete the row (`deletePushSubscription`) |
| **Not verified end-to-end against a real push service** | ⚠️ | Sandbox network policy blocked outbound requests during this build's QA pass. Before relying on this in production, click "Send test notification" (Layout sidebar, once notifications are enabled) from a real browser and confirm the OS notification appears. |

## Lighthouse score expectations

- **Performance**: the `pdfjs-dist` PDF viewer (~1.2MB) and its dialog chunk
  (~486KB) are lazy-loaded (`React.lazy`) and won't count against the initial
  bundle — confirm the "Reduce unused JavaScript" audit doesn't flag them on
  first load.
- **Accessibility / Best Practices**: unrelated to this PWA work — see
  `CODE_REVIEW.md` for known frontend gaps.
- **PWA category**: Lighthouse's own "installable" and "PWA optimized" audits
  should be green given the manifest/SW state above. If Lighthouse flags a
  missing "maskable icon", double check `icon-maskable-512.png` wasn't
  regenerated with insufficient padding — that's the most common regression here.

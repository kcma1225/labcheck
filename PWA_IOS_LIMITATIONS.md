# iOS PWA limitations — what to tell stakeholders

Graduate Research Workspace works on iOS Safari, but iOS treats installed web
apps very differently from Android/desktop Chrome. Set expectations with the
research team accordingly, especially anyone relying on this for reminders.

## Installation is manual, every time

- There is **no install prompt** on iOS — `beforeinstallprompt` doesn't exist
  in Safari. The `InstallButton` in this app simply won't render on iPhone/iPad.
- Users must install it themselves: **Share button → Add to Home Screen**.
  Consider adding this instruction somewhere visible for iOS users (a one-line
  note on the Home page, detected via `navigator.userAgent` or
  `navigator.standalone`), since most people never discover this menu item on
  their own.
- The app only gets its own icon, standalone window (no Safari address bar),
  and `apple-mobile-web-app-*` styling **after** that manual step — visiting
  the site in Safari without installing behaves like a normal, tab-chrome'd website.

## Push notifications: iOS 16.4+ only, and only if installed

- Web Push on iOS requires **iOS/iPadOS 16.4 or later** (released March 2023).
  Anyone on an older device sees `pushSupported()` return `false` and the
  "Enable notifications" control simply won't appear — no error, no explanation.
- Push **only works after the app has been added to the Home Screen**. Opening
  the site in a normal Safari tab, even on iOS 16.4+, does not expose the
  `PushManager` API at all.
- The permission prompt itself is more restrictive: Safari requires the
  subscribe attempt to happen in direct response to a user gesture (a button
  click — already how `enablePush()` is wired here), and iOS shows its own
  system-level notification settings, separate from the in-app toggle.
- Practical consequence for this app: a lab member who wants task/event
  reminders on their iPhone must (1) open the site in Safari, (2) Add to Home
  Screen, (3) open the app **from the Home Screen icon**, not the Safari tab,
  then (4) tap "Enable notifications". Any step skipped and push silently
  doesn't work.

## Background Sync is not supported at all

- The `SyncManager` API (`registration.sync.register(...)`) does not exist in
  any iOS browser (all iOS browsers are Safari/WebKit under the hood, per
  Apple's App Store policy — "Chrome" and "Firefox" on iOS are WebKit wrappers).
- This app already has a fallback for that: the offline mutation queue flushes
  on the page's `online` event instead of a background sync event
  (`src/frontend/lib/pwa.ts`, `public/sw.js`). The practical difference: on
  Android/desktop, a queued edit can sync even if the tab is closed; on iOS, the
  app must actually be reopened (or brought back into view) while online for
  the queue to flush.

## Storage and the service worker can be evicted

- iOS enforces **7-day Safari storage eviction** under Intelligent Tracking
  Prevention (ITP): if the installed app (or the site in Safari) isn't opened
  for 7 days, iOS can wipe its Cache Storage, IndexedDB, and service worker
  registration entirely. A team member who doesn't check in for a week or two
  may find the app "resets" — offline cache gone, any still-queued offline
  edits lost, push subscription silently invalidated.
- There is no API to detect or prevent this ahead of time; the only mitigation
  is opening the app regularly, or accepting that infrequent users lose offline
  state and need to re-enable notifications after a gap.
- iOS is also more aggressive about terminating the service worker process
  between uses than Android/desktop Chrome — this doesn't lose cached data (that
  survives), but it means the SW's in-memory state (none is currently kept in
  this app) can't be relied on to persist between requests, on any platform, but
  especially here.

## Smaller, easy-to-miss differences

- **No maskable icon rendering**: iOS uses the plain `apple-touch-icon` link
  (`public/icons/apple-touch-icon.png`, already added to `index.html`) and
  ignores the manifest's `icons` array and `purpose: "maskable"` entry entirely.
  If the app icon ever needs updating, the apple-touch-icon file must be updated
  too — the manifest icons alone won't change what iOS shows.
- **Status bar styling** comes from `apple-mobile-web-app-status-bar-style`
  (`index.html`), not the manifest's `theme_color` — already set to
  `black-translucent` here.
- **No app badging** (the small unread-count badge on an app icon) — the
  Badging API (`navigator.setAppBadge`) isn't implemented on iOS as of this
  writing, so there's no way to show, e.g., "3 tasks due" on the Home Screen icon.
- **`display: "standalone"` can still show a status bar / lack a back gesture**
  depending on iOS version — test the installed app on an actual device rather
  than trusting the manifest value alone.

## Bottom line for planning

If reminders reaching lab members on iPhones is important, budget time for:
(1) an in-app "how to install on iPhone" nudge, since there's no browser
prompt to rely on, and (2) accepting that iOS push delivery will be less
reliable than Android/desktop for anyone who doesn't open the app at least
weekly, due to the 7-day storage eviction policy above.

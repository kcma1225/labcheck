/** Shared theme preference. index.html mirrors the storage/default logic before paint. */
export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_KEY = "theme";

const listeners = new Set<() => void>();
let pref: ThemePref = readStoredPref();
let initialized = false;
let revision = 0;
let fallbackTimer: number | undefined;
let activeTransition: { skipTransition(): void } | undefined;

function readStoredPref(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Blocked storage: follow the system, without persisting changes.
  }
  return "system";
}

export function resolveTheme(p: ThemePref = pref): ResolvedTheme {
  return p === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : p;
}

export function getThemePref(): ThemePref {
  return pref;
}

export function getResolvedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function emit(): void {
  listeners.forEach((fn) => fn());
}

function applyAttribute(next: ResolvedTheme): void {
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", next === "dark" ? "#0c0e12" : "#f9fafb");
  // View Transition callbacks run asynchronously. Notify React when the DOM
  // actually changes, not only when the preference was requested.
  emit();
}

function cancelAnimation(): number {
  ++revision;
  activeTransition?.skipTransition();
  activeTransition = undefined;
  window.clearTimeout(fallbackTimer);
  document.documentElement.classList.remove("theme-transition", "theme-reveal");
  return revision;
}

function animateToTheme(next: ResolvedTheme, origin?: { x: number; y: number }): void {
  const token = cancelAnimation();
  const root = document.documentElement;
  if (next === getResolvedTheme() || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    applyAttribute(next);
    return;
  }

  if (document.startViewTransition && origin) {
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty("--theme-reveal-x", `${origin.x}px`);
    root.style.setProperty("--theme-reveal-y", `${origin.y}px`);
    root.style.setProperty("--theme-reveal-r", `${Math.ceil(radius)}px`);
    root.classList.add("theme-reveal");
    try {
      const transition = document.startViewTransition(() => {
        // A skipped transition may still invoke its callback after a newer click.
        if (token === revision) applyAttribute(next);
      });
      activeTransition = transition;
      void transition.finished.catch(() => {}).finally(() => {
        if (token !== revision) return;
        root.classList.remove("theme-reveal");
        activeTransition = undefined;
      });
      return;
    } catch {
      root.classList.remove("theme-reveal");
      // Fall back if a browser exposes the API but cannot start a transition.
    }
  }

  root.classList.add("theme-transition");
  applyAttribute(next);
  fallbackTimer = window.setTimeout(() => {
    if (token === revision) root.classList.remove("theme-transition");
  }, 340);
}

export function setThemePref(next: ThemePref, origin?: { x: number; y: number }): void {
  pref = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* Memory-only preference. */ }
  animateToTheme(resolveTheme(next), origin);
  emit();
}

/** Cycle order: light → dark → system → light. */
export function cycleThemePref(origin?: { x: number; y: number }): ThemePref {
  const order: ThemePref[] = ["light", "dark", "system"];
  const next = order[(order.indexOf(pref) + 1) % order.length];
  setThemePref(next, origin);
  return next;
}

export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initTheme(): void {
  if (initialized) return;
  initialized = true;
  applyAttribute(resolveTheme());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (pref === "system") animateToTheme(resolveTheme());
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY && e.key !== null) return;
    pref = readStoredPref();
    cancelAnimation();
    applyAttribute(resolveTheme());
  });
}

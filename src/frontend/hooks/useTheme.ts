import { useSyncExternalStore } from "react";
import {
  cycleThemePref,
  getResolvedTheme,
  getThemePref,
  setThemePref,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePref,
} from "../lib/theme";

function snapshot(): string {
  // One primitive so useSyncExternalStore can compare cheaply; both halves
  // matter ("system" needs to re-render when the OS flips).
  return `${getThemePref()}:${getResolvedTheme()}`;
}

/** Server snapshot never runs (SPA, no SSR) but useSyncExternalStore wants one. */
const serverSnapshot = () => "system:light";

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: typeof setThemePref;
  cycle: typeof cycleThemePref;
} {
  const value = useSyncExternalStore(subscribeTheme, snapshot, serverSnapshot);
  const [pref, resolved] = value.split(":") as [ThemePref, ResolvedTheme];
  return { pref, resolved, setPref: setThemePref, cycle: cycleThemePref };
}

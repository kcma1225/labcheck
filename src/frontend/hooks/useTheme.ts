import { useLayoutEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import {
  cycleThemePref,
  getResolvedTheme,
  getThemePref,
  setMobileThemeOverride,
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

const MOBILE_QUERY = "(width < 768px)";

export function useMobileThemeOverride(includeStandalone = false): boolean {
  const isStandalone = () => includeStandalone && (
    (window.matchMedia?.("(display-mode: standalone)").matches ?? false) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const [mobile, setMobile] = useState(() => (window.matchMedia?.(MOBILE_QUERY).matches ?? false) || isStandalone());
  useLayoutEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    const standalone = includeStandalone ? window.matchMedia?.("(display-mode: standalone)") : undefined;
    const apply = () => {
      const active = (mq?.matches ?? false) || isStandalone();
      setMobile(active);
      setMobileThemeOverride(active);
    };
    apply();
    mq?.addEventListener("change", apply);
    standalone?.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("pageshow", apply);
    return () => {
      mq?.removeEventListener("change", apply);
      standalone?.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("pageshow", apply);
      setMobileThemeOverride(false);
    };
  }, [includeStandalone]);
  return mobile;
}

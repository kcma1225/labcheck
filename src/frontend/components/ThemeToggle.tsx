import type { MouseEvent } from "react";
import { useTheme } from "../hooks/useTheme";
import { Icon } from "./ui";
import type { ThemePref } from "../lib/theme";

const LABEL: Record<ThemePref, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICON: Record<ThemePref, string> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
};

/**
 * Icon-only toggle, always placed at the top-right of its page/sidebar.
 * Cycles light → dark → system. The click coordinates seed the circular
 * reveal animation, so the new theme wipes out from the button itself.
 */
export function ThemeToggleIcon({ className = "" }: { className?: string }) {
  const { pref, cycle } = useTheme();

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    cycle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Theme: ${LABEL[pref]} — click to change`}
      aria-label={`Theme: ${LABEL[pref]}. Click to change.`}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-gray-100 ${className}`}
    >
      <span className="theme-icon-swap relative inline-flex h-4 w-4">
        <Icon key={pref} name={ICON[pref]} className="h-4 w-4" />
      </span>
    </button>
  );
}

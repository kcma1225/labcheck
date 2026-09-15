export interface ColorSwatch {
  label: string;
  hex: string | null;
}

/** Shared palette for events and project tabs — keep this the one place it's defined. */
export const COLOR_SWATCHES: ColorSwatch[] = [
  { label: "Default", hex: null },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Green", hex: "#22c55e" },
  { label: "Red", hex: "#ef4444" },
  { label: "Amber", hex: "#f59e0b" },
  { label: "Violet", hex: "#8b5cf6" },
  { label: "Slate", hex: "#64748b" },
];

export const DEFAULT_TAB_COLOR = "#94a3b8";

export function tabColor(p: { color: string | null }): string {
  return p.color ?? DEFAULT_TAB_COLOR;
}

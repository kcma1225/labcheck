import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useLayoutEffect, useRef } from "react";
import { COLOR_SWATCHES } from "../lib/colors";

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-md border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="min-w-0 break-words text-sm font-semibold text-gray-700">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gray-900 text-white hover:bg-gray-700",
  ghost: "border border-gray-300 text-gray-700 hover:bg-gray-100",
  danger: "border border-red-200 text-red-600 hover:bg-red-50",
};

export function Button({
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Back-compat alias. */
export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button variant="ghost" {...props} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-gray-600">{children}</span>;
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-w-0 max-w-full w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${className}`}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-w-0 max-w-full w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${className}`}
    />
  );
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-w-0 max-w-full w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 ${className}`}
    />
  );
}

/** Shared color swatch picker — used by the event, project-tab and group editors. */
export function ColorPicker({
  value,
  onChange,
  compact = false,
  mobileSelect = false,
  label = "Color",
  disabled = false,
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
  mobileSelect?: boolean;
  label?: string;
  disabled?: boolean;
  /** Smaller swatches for tight spaces, e.g. a table row in the manage dialog. */
  compact?: boolean;
}) {
  const size = compact ? "h-4 w-4" : "h-6 w-6";
  const swatches = (
    <div className={`flex max-w-full flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
          disabled={disabled}
          onClick={() => onChange(c.hex)}
          className={`${size} shrink-0 rounded-full border ${
            value === c.hex ? "border-gray-900 ring-2 ring-gray-900/20" : "border-gray-200"
          }`}
          style={{
            backgroundColor: c.hex ?? "var(--color-white)",
            backgroundImage: c.hex
              ? undefined
              : "linear-gradient(45deg,var(--color-gray-200) 25%,transparent 25%,transparent 75%,var(--color-gray-200) 75%)",
          }}
        />
      ))}
    </div>
  );
  if (!mobileSelect) return swatches;
  return (
    <div className="min-w-0 max-w-full">
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <span
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-full border border-gray-300"
          style={{
            backgroundColor: value ?? "var(--color-white)",
            backgroundImage: value
              ? undefined
              : "linear-gradient(45deg,var(--color-gray-200) 25%,transparent 25%,transparent 75%,var(--color-gray-200) 75%)",
          }}
        />
        <Select aria-label={label} className="flex-1" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          {COLOR_SWATCHES.map((c) => (
            <option key={c.label} value={c.hex ?? ""}>{c.label}</option>
          ))}
          {value !== null && !COLOR_SWATCHES.some((c) => c.hex === value) && (
            <option value={value}>Custom ({value})</option>
          )}
        </Select>
      </div>
      <div className="hidden md:block">{swatches}</div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-red-600">{children}</p> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}

export function Modal({
  open,
  onClose,
  title,
  headerActions,
  children,
  bottomSheet = false,
  centered = false,
  id,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered in the header's top-right corner, before the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
  bottomSheet?: boolean;
  centered?: boolean;
  id?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertElements: HTMLElement[] = [];
    let current: HTMLElement = panel.parentElement!;
    while (current.parentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== current && !sibling.inert) {
          sibling.inert = true;
          inertElements.push(sibling);
        }
      }
      current = current.parentElement;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus({ preventScroll: true });
    // Bottom sheets slide up from the bottom edge, started imperatively after
    // the focus/inert setup above. A mount-time CSS animation races those
    // same-frame DOM mutations and starts late (or never), so the sheet sits
    // hidden and then snaps into place. Starting the Web Animations timeline
    // explicitly — still before first paint, since this is a layout effect —
    // gives the compositor the full keyframe set up front, so the first
    // painted frame is already the parked bottom state and the slide runs
    // bottom-up every time instead of jumping.
    if (bottomSheet && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      panel.animate(
        [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
        { duration: 180, easing: "ease-out" },
      );
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0] ?? panel;
        const last = elements[elements.length - 1] ?? panel;
        if (event.shiftKey ? document.activeElement === first || document.activeElement === panel : document.activeElement === last || document.activeElement === panel) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      inertElements.forEach(element => { element.inert = false; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
      else {
        const fallback = Array.from(document.querySelectorAll<HTMLElement>('[aria-controls="workspace-menu-sheet"], #workspace-navigation a')).find(element => element.getClientRects().length > 0);
        fallback?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={bottomSheet ? "fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-scrim/40" : `safe-overlay fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-scrim/40 ${centered ? "items-center" : "items-start"}`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        id={id}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={bottomSheet ? "mobile-sheet flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] min-w-0 w-full flex-col rounded-t-2xl border border-gray-200 bg-white shadow-xl" : "min-w-0 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <h2 className="min-w-0 break-words text-sm font-semibold text-gray-800">{title}</h2>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className={bottomSheet ? "min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]" : "p-4"}>{children}</div>
      </div>
    </div>
  );
}

const PATHS: Record<string, ReactNode> = {
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  trash: (
    <path d="M3 4h10M6.5 4V3h3v1M5 4l.5 9h5L11 4M7 6.5v4M9 6.5v4" />
  ),
  link: (
    <path d="M6.5 9.5l3-3M6 5H4.5A2.5 2.5 0 0 0 4.5 10H6M10 5h1.5a2.5 2.5 0 0 1 0 5H10" />
  ),
  file: <path d="M4 2h5l3 3v9H4zM9 2v3h3" />,
  copy: <path d="M5 5V3h8v8h-2M3 5h8v8H3z" />,
  plus: <path d="M8 3v10M3 8h10" />,
  lock: <path d="M5 7V5a3 3 0 0 1 6 0v2M3.5 7h9v7h-9zM8 10v1.5" />,
  calendar: <path d="M3 4h10v10H3zM3 7h10M6 2v3M10 2v3" />,
  external: <path d="M9 3h4v4M13 3l-6 6M11 9v4H3V5h4" />,
  edit: <path d="M10.5 2.5l3 3L5 14H2v-3zM9 4l3 3" />,
  key: <path d="M6 10a3 3 0 1 1 2.4-4.8L14 10.6M11 5l1.5 1.5M9.5 6.5 11 8" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2.2 1.3" />
    </>
  ),
  location: (
    <path d="M8 14s4.5-4.2 4.5-7.5A4.5 4.5 0 1 0 3.5 6.5C3.5 9.8 8 14 8 14zM8 8.3a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z" />
  ),
  text: <path d="M3 4h10M3 8h10M3 12h6" />,
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="4" r="1.1" />
      <circle cx="10" cy="4" r="1.1" />
      <circle cx="6" cy="8" r="1.1" />
      <circle cx="10" cy="8" r="1.1" />
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="10" cy="12" r="1.1" />
    </g>
  ),
  manage: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2.5v1.8M8 11.7v1.8M2.5 8h1.8M11.7 8h1.8M4.3 4.3l1.3 1.3M10.4 10.4l1.3 1.3M4.3 11.7l1.3-1.3M10.4 5.6l1.3-1.3" />
    </>
  ),
  bell: (
    <path d="M8 2.5a3 3 0 0 0-3 3v1.8c0 .8-.3 1.6-.9 2.2L3 10.7h10l-1.1-1.2a3 3 0 0 1-.9-2.2V5.5a3 3 0 0 0-3-3zM6.5 12.7a1.5 1.5 0 0 0 3 0" />
  ),
  "bell-off": (
    <path d="M8 2.5a3 3 0 0 0-3 3v1.8c0 .8-.3 1.6-.9 2.2L3 10.7h10l-1.1-1.2a3 3 0 0 1-.9-2.2V5.5a3 3 0 0 0-3-3zM6.5 12.7a1.5 1.5 0 0 0 3 0M2.5 2.5l11 11" />
  ),
  download: <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 12.5h10" />,
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </>
  ),
  moon: <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />,
  monitor: <path d="M2.5 3.5h11v7h-11zM6 13h4M8 10.5V13" />,
  "book-open": (
    <path d="M8 4.5C6.8 3.5 5 3 3 3v9c2 0 3.8.5 5 1.5M8 4.5C9.2 3.5 11 3 13 3v9c-2 0-3.8.5-5 1.5M8 4.5v10" />
  ),
  "chevron-left": <path d="M10 3 5 8l5 5" />,
  "chevron-right": <path d="M6 3l5 5-5 5" />,
};

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

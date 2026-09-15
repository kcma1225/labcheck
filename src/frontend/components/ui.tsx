import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useEffect } from "react";
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
    <section className={`min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
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
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
  /** Smaller swatches for tight spaces, e.g. a table row in the manage dialog. */
  compact?: boolean;
}) {
  const size = compact ? "h-4 w-4" : "h-6 w-6";
  return (
    <div className={`flex max-w-full flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered in the header's top-right corner, before the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="safe-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className="min-w-0 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl"
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
        <div className="p-4">{children}</div>
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

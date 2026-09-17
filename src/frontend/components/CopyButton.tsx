import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export function CopyButton({ value, label = "Copy", iconOnly = false }: { value: string; label?: string; iconOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; success: boolean } | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), feedback.success ? 2200 : 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    setBusy(true);
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current) setFeedback({ id: ++sequence.current, success: true });
    } catch {
      if (mounted.current) setFeedback({ id: ++sequence.current, success: false });
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={copy}
        disabled={busy}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={`inline-flex items-center justify-center gap-1 rounded-md border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50 ${iconOnly ? "min-h-11 min-w-11" : "px-2 py-1"}`}
      >
        <Icon name="copy" className="h-3.5 w-3.5" />
        {!iconOnly && (busy ? "Copying…" : label)}
      </button>
      <span role="status" aria-live="polite" aria-atomic="true">
        {feedback && (
          <span
            key={feedback.id}
            className={`copy-feedback pointer-events-none absolute bottom-full right-0 z-50 mb-2 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium text-onscrim shadow-lg ${feedback.success ? "bg-toast-ok" : "bg-toast-err"}`}
          >
            {feedback.success && <span aria-hidden="true">✓</span>}
            {feedback.success ? "Copied!" : "Copy failed. Please try again."}
          </span>
        )}
      </span>
    </span>
  );
}

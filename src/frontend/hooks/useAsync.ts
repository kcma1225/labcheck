import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

// Window-focus refetch (spec section 51) is meant to catch up after being away,
// not to refire every time you alt-tab back for a second. Throttle it so a
// quick focus/blur/focus doesn't turn into repeated /api/* calls.
const FOCUS_REFRESH_MIN_MS = 60_000;

/**
 * Fetch-on-mount + on-demand reload. Deliberately simple: no polling,
 * no realtime — reload happens on user actions and (throttled) window focus.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  const requestId = useRef(0);
  const lastRunAt = useRef(0);
  fnRef.current = fn;

  const run = useCallback(() => {
    lastRunAt.current = Date.now();
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fnRef.current())
      .then((value) => { if (id === requestId.current) setData(value); })
      .catch((e: Error) => { if (id === requestId.current) setError(e.message); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData(null);
    run();
    return () => { ++requestId.current; };
  }, [run]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastRunAt.current >= FOCUS_REFRESH_MIN_MS) run();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [run]);

  return { data, error, loading, reload: run };
}

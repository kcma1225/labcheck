import { useEffect, useState } from "react";
import { getPwaState, subscribePwaState } from "../lib/pwa";

/** Re-renders whenever install/update/push-related PWA state changes. */
export function usePwaState() {
  const [, setTick] = useState(0);
  useEffect(() => subscribePwaState(() => setTick((n) => n + 1)), []);
  return getPwaState();
}

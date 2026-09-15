import { useState } from "react";
import type { CalendarEvent } from "../../shared/types";

// Tapping an existing event shows a read-only info popover first ("info");
// its Edit button (or "New event") switches to the full form ("edit").
type CalendarDialogState =
  | { mode: "closed" }
  | { mode: "info"; event: CalendarEvent }
  | { mode: "edit"; event: CalendarEvent | null; date?: Date };

export function useCalendarDialogs() {
  const [state, setState] = useState<CalendarDialogState>({ mode: "closed" });

  return {
    state,
    /** Day cell clicked, or the "New event" button. */
    openCreate: (date?: Date) => setState({ mode: "edit", event: null, date }),
    /** Event pill clicked — show details first, not the edit form. */
    openInfo: (event: CalendarEvent) => setState({ mode: "info", event }),
    /** The info popover's Edit button. */
    openEdit: (event: CalendarEvent) => setState({ mode: "edit", event }),
    close: () => setState({ mode: "closed" }),
  };
}

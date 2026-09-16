import type { CalendarEvent } from "../../shared/types";
import { googleCalendarUrl } from "../lib/gcal";
import { toDateInput } from "../lib/date";
import { eventColor } from "./CalendarMonth";
import { Icon, Modal } from "./ui";

const TYPE_LABEL: Record<string, string> = {
  meeting: "Meeting",
  deadline: "Deadline",
  milestone: "Milestone",
  event: "Event",
};

interface Props {
  open: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit: () => void;
}

/** Read-only preview shown when an existing event is tapped — Edit (top-right corner) opens the form. */
export function EventInfoPopover({ open, event, onClose, onEdit }: Props) {
  if (!event) return null;

  return (
    <Modal
      open={open}
      centered
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: eventColor(event) }}
          />
          {TYPE_LABEL[event.type] ?? event.type}
        </span>
      }
      headerActions={
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          <Icon name="edit" className="h-3.5 w-3.5" />
          Edit
        </button>
      }
    >
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900">{event.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-gray-600">
          <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />
          {formatEventWhen(event)}
        </p>

        {event.location && (
          <p className="flex items-center gap-1.5 text-sm text-gray-600">
            <Icon name="location" className="h-3.5 w-3.5 shrink-0" />
            {event.location}
          </p>
        )}

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 break-all text-sm text-blue-600 hover:underline"
          >
            <Icon name="link" className="h-3.5 w-3.5 shrink-0" />
            {event.url}
          </a>
        )}

        {event.description && (
          <p className="flex items-start gap-1.5 whitespace-pre-wrap text-sm text-gray-700">
            <Icon name="text" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {event.description}
          </p>
        )}

        <a
          href={googleCalendarUrl(event)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 hover:underline"
        >
          <Icon name="calendar" className="h-3.5 w-3.5" />
          Add to Google Calendar
        </a>
      </div>
    </Modal>
  );
}

function formatEventWhen(ev: CalendarEvent): string {
  const start = new Date(ev.start_at);
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  if (ev.all_day) {
    // All-day end_at is exclusive midnight of the day after the last covered day.
    const lastDay = ev.end_at ? new Date(ev.end_at - 1) : start;
    if (toDateInput(start.getTime()) === toDateInput(lastDay.getTime())) {
      return `${start.toLocaleDateString(undefined, dateOpts)} · All day`;
    }
    return `${start.toLocaleDateString(undefined, dateOpts)} – ${lastDay.toLocaleDateString(undefined, dateOpts)} · All day`;
  }

  const end = ev.end_at ? new Date(ev.end_at) : null;
  if (!end || toDateInput(start.getTime()) === toDateInput(end.getTime())) {
    const startLabel = `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)}`;
    return end ? `${startLabel} – ${end.toLocaleTimeString(undefined, timeOpts)}` : startLabel;
  }

  return (
    `${start.toLocaleDateString(undefined, dateOpts)} ${start.toLocaleTimeString(undefined, timeOpts)}` +
    ` – ${end.toLocaleDateString(undefined, dateOpts)} ${end.toLocaleTimeString(undefined, timeOpts)}`
  );
}

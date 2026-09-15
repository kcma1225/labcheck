import { useEffect, useState } from "react";
import type { CalendarEvent, EventType, Project } from "../../shared/types";
import { api } from "../api/client";
import { googleCalendarUrl } from "../lib/gcal";
import { tabColor } from "../lib/colors";
import {
  combineDateTime,
  dateOnlyMs,
  toDateInput,
  toTimeInput,
} from "../lib/date";
import { Button, ColorPicker, ErrorText, Field, Icon, Input, Modal, Select, Textarea } from "./ui";

const TYPES: EventType[] = ["meeting", "deadline", "milestone", "event"];

interface Props {
  open: boolean;
  workspaceId: string;
  event: CalendarEvent | null;
  defaultDate?: Date;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  title: string;
  type: EventType;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  color: string | null;
  projectId: string | null;
  location: string;
  url: string;
  description: string;
}

function seed(event: CalendarEvent | null, defaultDate?: Date): FormState {
  if (event) {
    return {
      title: event.title,
      type: event.type,
      allDay: !!event.all_day,
      startDate: toDateInput(event.start_at),
      startTime: toTimeInput(event.start_at),
      endDate: toDateInput(event.end_at ?? event.start_at),
      endTime: toTimeInput(event.end_at ?? event.start_at + 3_600_000),
      color: event.color,
      projectId: event.project_id,
      location: event.location ?? "",
      url: event.url ?? "",
      description: event.description ?? "",
    };
  }
  const base = defaultDate ?? new Date();
  const now = new Date();
  const start = new Date(base);
  start.setHours(now.getHours(), 0, 0, 0);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    title: "",
    type: "meeting",
    allDay: false,
    startDate: toDateInput(start.getTime()),
    startTime: toTimeInput(start.getTime()),
    endDate: toDateInput(end.getTime()),
    endTime: toTimeInput(end.getTime()),
    color: null,
    projectId: null,
    location: "",
    url: "",
    description: "",
  };
}

export function EventDialog({ open, workspaceId, event, defaultDate, projects, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => seed(event, defaultDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(seed(event, defaultDate));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, defaultDate?.getTime()]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function selectProject(projectId: string | null) {
    const project = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
    setForm((f) => ({ ...f, projectId, color: project ? tabColor(project) : f.color }));
  }

  function resolveTimes(): { start: number; end: number } {
    if (form.allDay) {
      return { start: dateOnlyMs(form.startDate), end: dateOnlyMs(form.endDate || form.startDate) };
    }
    return {
      start: combineDateTime(form.startDate, form.startTime),
      end: combineDateTime(form.endDate || form.startDate, form.endTime),
    };
  }

  const { start, end } = resolveTimes();

  async function save() {
    setError(null);
    if (!form.title.trim()) return setError("Title is required");
    if (!Number.isFinite(start) || !Number.isFinite(end)) return setError("Valid dates are required");
    if (end < start) return setError("End must be after start");

    setBusy(true);
    const payload = {
      title: form.title.trim(),
      type: form.type,
      all_day: form.allDay,
      start_at: start,
      end_at: end,
      color: form.color,
      project_id: form.projectId,
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      description: form.description.trim() || null,
    };
    try {
      if (event) {
        await api.patch(`/workspaces/${workspaceId}/events/${event.id}`, payload);
      } else {
        await api.post(`/workspaces/${workspaceId}/events`, payload);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    setBusy(true);
    try {
      await api.delete(`/workspaces/${workspaceId}/events/${event.id}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const gcalHref = googleCalendarUrl({
    title: form.title || "(untitled)",
    start_at: start,
    end_at: end,
    all_day: form.allDay,
    description: form.description,
    location: form.location,
    url: form.url,
  });

  return (
    <Modal open={open} onClose={onClose} title={event ? "Edit event" : "New event"}>
      <div className="space-y-3">
        <Field label="Title">
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Event title"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set("allDay", e.target.checked)}
          />
          All day
        </label>

        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Icon name="clock" className="h-3.5 w-3.5" />
          Date &amp; time
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </Field>
          <Field label={form.allDay ? " " : "Start time"}>
            <Input
              type="time"
              disabled={form.allDay}
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </Field>
          <Field label="End">
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </Field>
          <Field label={form.allDay ? " " : "End time"}>
            <Input
              type="time"
              disabled={form.allDay}
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Tab">
          <Select
            value={form.projectId ?? ""}
            onChange={(e) => selectProject(e.target.value || null)}
          >
            <option value="">No tab</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as EventType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-gray-600">Color</span>
            <div className="pt-1">
              <ColorPicker value={form.color} onChange={(hex) => set("color", hex)} />
            </div>
          </div>
        </div>

        <Field
          label={
            <span className="inline-flex items-center gap-1">
              <Icon name="location" className="h-3.5 w-3.5" />
              Location
            </span>
          }
        >
          <Input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Room, address, or video call"
          />
        </Field>

        <Field label="Link">
          <Input
            type="url"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field
          label={
            <span className="inline-flex items-center gap-1">
              <Icon name="text" className="h-3.5 w-3.5" />
              Description
            </span>
          }
        >
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <ErrorText>{error}</ErrorText>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : event ? "Save changes" : "Create event"}
          </Button>
          <a
            href={gcalHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Icon name="calendar" />
            Add to Google Calendar
          </a>
          {event && (
            <Button variant="danger" onClick={remove} disabled={busy} className="ml-auto">
              <Icon name="trash" />
              Delete
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { useCalendarDialogs } from "../hooks/useCalendarDialogs";
import { useMobileThemeOverride } from "../hooks/useTheme";
import { EventDialog } from "../components/EventDialog";
import { EventInfoPopover } from "../components/EventInfoPopover";
import { NotesPanel } from "../components/NotesPanel";
import { ResourcesPanel } from "../components/ResourcesPanel";
import { TasksPanel } from "../components/TasksPanel";
import { Card, Empty } from "../components/ui";
import { fmtDateTime, ymd } from "../lib/date";
import { tabColor } from "../lib/colors";
import { truncateEventTitle } from "../lib/format";
import type { CalendarEvent, Project } from "../../shared/types";

const DAY = 86_400_000;
const SUB_NAV = [
  { to: "overview", label: "Overview" },
  { to: "notes", label: "Notes" },
  { to: "resources", label: "Resources" },
];

/** Shell for a tab: header (color, name, sub-page nav) plus an Outlet for the selected sub-page. */
export function ProjectPage() {
  const { workspaceId = "", projectId = "" } = useParams();
  const base = `/w/${workspaceId}/projects/${projectId}`;

  const project = useAsync<{ project: Project }>(
    () => api.get(`/workspaces/${workspaceId}/projects/${projectId}`),
    [workspaceId, projectId],
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          {project.data && (
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: tabColor(project.data.project) }}
            />
          )}
          <h1 className="min-w-0 break-words text-xl font-semibold">{project.data?.project.name ?? "Tab"}</h1>
        </div>
        {project.data?.project.description && (
          <p className="text-sm text-gray-600">{project.data.project.description}</p>
        )}
      </div>

      <nav className="grid w-full grid-cols-3 rounded-lg border border-gray-200 p-0.5 text-center text-sm md:inline-flex md:w-auto">
        {SUB_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={`${base}/${item.to}`}
            className={({ isActive }) =>
              `flex min-h-11 items-center justify-center rounded-md px-3 py-1 text-center font-medium md:min-h-0 ${isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}

export function ProjectOverviewTab() {
  const { workspaceId = "", projectId = "" } = useParams();
  const from = ymd(new Date());
  const to = ymd(new Date(Date.now() + 90 * DAY));

  const events = useAsync<{ events: CalendarEvent[] }>(
    () => api.get(`/workspaces/${workspaceId}/events?projectId=${projectId}&from=${from}&to=${to}`),
    [workspaceId, projectId, from, to],
  );
  const projects = useAsync<{ projects: Project[] }>(
    () => api.get(`/workspaces/${workspaceId}/projects`),
    [workspaceId],
  );
  const cal = useCalendarDialogs();
  const mobile = useMobileThemeOverride(true);
  const [eventPage, setEventPage] = useState(0);
  const eventPageSize = mobile ? 5 : 7;
  const upcomingEvents = events.data?.events ?? [];
  const eventPageCount = Math.ceil(upcomingEvents.length / eventPageSize);

  useEffect(() => {
    setEventPage((page) => Math.min(page, Math.max(0, eventPageCount - 1)));
  }, [mobile, events.data, eventPageCount]);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <TasksPanel workspaceId={workspaceId} projectId={projectId} />

        <Card title="Upcoming events">
          {events.loading ? (
            <Empty>Loading…</Empty>
          ) : (events.data?.events.length ?? 0) === 0 ? (
            <Empty>Nothing scheduled. Add one from the Dashboard calendar.</Empty>
          ) : (
            <>
              <ul className="space-y-1">
                {upcomingEvents
                  .slice(eventPage * eventPageSize, (eventPage + 1) * eventPageSize)
                  .map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => cal.openInfo(e)}
                        className="w-full rounded-md p-1.5 text-left text-sm hover:bg-gray-50"
                      >
                        <div className="truncate font-medium text-gray-800" title={e.title} aria-label={e.title}>
                          {truncateEventTitle(e.title)}
                        </div>
                        <div className="text-xs text-gray-400">{fmtDateTime(e.start_at)}</div>
                      </button>
                    </li>
                  ))}
              </ul>
              {upcomingEvents.length > eventPageSize && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <button type="button" aria-label="Previous upcoming events page" disabled={eventPage === 0} onClick={() => setEventPage((page) => page - 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Previous</button>
                  <span>Page {eventPage + 1} of {eventPageCount}</span>
                  <button type="button" aria-label="Next upcoming events page" disabled={eventPage >= eventPageCount - 1} onClick={() => setEventPage((page) => page + 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Next</button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <EventInfoPopover
        open={cal.state.mode === "info"}
        event={cal.state.mode === "info" ? cal.state.event : null}
        onClose={cal.close}
        onEdit={() => cal.state.mode === "info" && cal.openEdit(cal.state.event)}
      />

      <EventDialog
        open={cal.state.mode === "edit"}
        workspaceId={workspaceId}
        event={cal.state.mode === "edit" ? cal.state.event : null}
        defaultDate={cal.state.mode === "edit" ? cal.state.date : undefined}
        projects={projects.data?.projects ?? []}
        onClose={cal.close}
        onSaved={() => {
          cal.close();
          events.reload();
        }}
      />
    </>
  );
}

export function ProjectNotesTab() {
  const { workspaceId = "", projectId = "" } = useParams();
  return <NotesPanel workspaceId={workspaceId} projectId={projectId} />;
}

export function ProjectResourcesTab() {
  const { workspaceId = "", projectId = "" } = useParams();
  return <ResourcesPanel workspaceId={workspaceId} projectId={projectId} />;
}

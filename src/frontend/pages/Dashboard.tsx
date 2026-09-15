import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { useCalendarDialogs } from "../hooks/useCalendarDialogs";
import { api, fileUrl } from "../api/client";
import { CalendarMonth } from "../components/CalendarMonth";
import { EventDialog } from "../components/EventDialog";
import { EventInfoPopover } from "../components/EventInfoPopover";
import { Button, Card, Empty, GhostButton, Icon } from "../components/ui";
import { fmtDate, fmtDateTime, monthRange, ymd } from "../lib/date";
import { tabColor } from "../lib/colors";
import { isPdfResource } from "../lib/resources";
import type { CalendarEvent, Project, Resource, Task } from "../../shared/types";

// pdfjs-dist is sizable — only fetch it when a PDF is actually opened.
const PdfViewerDialog = lazy(() =>
  import("../components/PdfViewerDialog").then((m) => ({ default: m.PdfViewerDialog })),
);

/** URL resources open directly; uploaded files open through the authenticated download route. */
function resourceLink(workspaceId: string, r: Resource): string {
  return r.type === "url" && r.url ? r.url : fileUrl(workspaceId, r.id);
}

const DAY = 86_400_000;

export function Dashboard() {
  const { workspaceId = "" } = useParams();

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const { from, to } = useMemo(() => monthRange(cursor), [cursor]);

  const projects = useAsync<{ projects: Project[] }>(
    () => api.get(`/workspaces/${workspaceId}/projects`),
    [workspaceId],
  );
  const events = useAsync<{ events: CalendarEvent[] }>(
    () => api.get(`/workspaces/${workspaceId}/events?from=${from}&to=${to}`),
    [workspaceId, from, to],
  );
  const tasks = useAsync<{ tasks: Task[] }>(
    () => api.get(`/workspaces/${workspaceId}/tasks?status=todo,doing`),
    [workspaceId],
  );
  const resources = useAsync<{ resources: Resource[] }>(
    () => api.get(`/workspaces/${workspaceId}/resources`),
    [workspaceId],
  );
  const resourceById = useMemo(
    () => new Map((resources.data?.resources ?? []).map((r) => [r.id, r])),
    [resources.data],
  );

  const upcomingFrom = ymd(new Date());
  const upcomingTo = ymd(new Date(Date.now() + 90 * DAY));
  const upcoming = useAsync<{ events: CalendarEvent[] }>(
    () => api.get(`/workspaces/${workspaceId}/events?from=${upcomingFrom}&to=${upcomingTo}`),
    [workspaceId, upcomingFrom, upcomingTo],
  );

  const cal = useCalendarDialogs();
  const [viewingPdf, setViewingPdf] = useState<Resource | null>(null);

  const projectById = new Map((projects.data?.projects ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Card title="Upcoming events">
          {upcoming.loading ? (
            <Empty>Loading…</Empty>
          ) : (upcoming.data?.events.length ?? 0) === 0 ? (
            <Empty>Nothing scheduled in the next 90 days.</Empty>
          ) : (
            <ul className="space-y-1">
              {upcoming.data!.events.map((e) => {
                const project = e.project_id ? projectById.get(e.project_id) : undefined;
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => cal.openInfo(e)}
                      className="w-full rounded-md p-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <div className="truncate font-medium text-gray-800">{e.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 break-words text-xs text-gray-400">
                        <span className="font-medium text-gray-600">{fmtDateTime(e.start_at)}</span>
                        {project && (
                          <Link
                            to={`/w/${workspaceId}/projects/${project.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500 hover:bg-gray-200"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tabColor(project) }}
                            />
                            {project.name}
                          </Link>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <GhostButton onClick={() => setCursor(startOfMonth(new Date()))} className="px-2 py-1">
                Today
              </GhostButton>
              <GhostButton
                onClick={() => setCursor(shiftMonth(cursor, -1))}
                aria-label="Previous month"
                className="px-2 py-1"
              >
                ‹
              </GhostButton>
              <span className="min-w-32 text-center">
                {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </span>
              <GhostButton
                onClick={() => setCursor(shiftMonth(cursor, 1))}
                aria-label="Next month"
                className="px-2 py-1"
              >
                ›
              </GhostButton>
            </span>
          }
          actions={
            <Button onClick={() => cal.openCreate()}>
              <Icon name="plus" />
              New event
            </Button>
          }
        >
          {events.loading ? (
            <Empty>Loading…</Empty>
          ) : (
            <>
              <CalendarMonth
                month={cursor}
                events={events.data?.events ?? []}
                onDayClick={(date) => cal.openCreate(date)}
                onEventClick={(event) => cal.openInfo(event)}
              />
              <p className="mt-2 text-xs text-gray-400">
                Click a day to add an event, or an event to view it.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Todo">
        {tasks.loading ? (
          <Empty>Loading…</Empty>
        ) : (tasks.data?.tasks.length ?? 0) === 0 ? (
          <Empty>Nothing to do</Empty>
        ) : (
          <ul className="space-y-1">
            {tasks.data!.tasks.map((t) => {
              const project = t.project_id ? projectById.get(t.project_id) : undefined;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-2 break-words text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      t.status === "doing" ? "bg-amber-400" : "bg-gray-300"
                    }`}
                  />
                  <span className="text-gray-800">{t.title}</span>
                  {project && (
                    <Link
                      to={`/w/${workspaceId}/projects/${project.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: tabColor(project) }}
                      />
                      {project.name}
                    </Link>
                  )}
                  {t.due_date && (
                    <span className="text-xs text-gray-400">
                      · <span className="font-medium text-gray-600">{fmtDate(t.due_date)}</span>
                    </span>
                  )}
                  {(() => {
                    const linked = t.resource_id ? resourceById.get(t.resource_id) : undefined;
                    if (!linked) return null;
                    return (
                      <span className="inline-flex items-center gap-1">
                        <a
                          href={resourceLink(workspaceId, linked)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Open ${linked.name}`}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
                        >
                          <Icon name={linked.type === "url" ? "link" : "file"} className="h-3 w-3" />
                          <span className="max-w-[8rem] truncate">{linked.name}</span>
                        </a>
                        {isPdfResource(linked) && (
                          <button
                            type="button"
                            onClick={() => setViewingPdf(linked)}
                            title="Open in PDF reader"
                            aria-label="Open in PDF reader"
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Icon name="book-open" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    );
                  })()}
                  {t.assignee_name && (
                    <span className="text-xs text-gray-400">· {t.assignee_name}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

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
          upcoming.reload();
        }}
      />

      {viewingPdf && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/70 text-sm text-onscrim">
              Loading viewer…
            </div>
          }
        >
          <PdfViewerDialog workspaceId={workspaceId} resource={viewingPdf} onClose={() => setViewingPdf(null)} />
        </Suspense>
      )}
    </div>
  );
}

function shiftMonth(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

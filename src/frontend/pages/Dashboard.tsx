import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { useCalendarDialogs } from "../hooks/useCalendarDialogs";
import { useMobileThemeOverride } from "../hooks/useTheme";
import { api, fileUrl } from "../api/client";
import { CalendarMonth } from "../components/CalendarMonth";
import { EventDialog } from "../components/EventDialog";
import { EventInfoPopover } from "../components/EventInfoPopover";
import { Button, Card, Empty, GhostButton, Icon, Modal } from "../components/ui";
import { fmtDate, fmtDateTime, monthRange, ymd } from "../lib/date";
import { tabColor } from "../lib/colors";
import { isPdfResource } from "../lib/resources";
import { truncateEventTitle, truncateTitle } from "../lib/format";
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
const TASK_STATUS_LABEL = { todo: "Not started", doing: "Progressing", done: "Done" } as const;

export function Dashboard() {
  const { workspaceId = "" } = useParams();
  const mobile = useMobileThemeOverride(true);

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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewingPdf, setViewingPdf] = useState<Resource | null>(null);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const upcomingPageSize = mobile ? 5 : 7;
  const upcomingEvents = upcoming.data?.events ?? [];
  const upcomingPageCount = Math.ceil(upcomingEvents.length / upcomingPageSize);
  const [todoPage, setTodoPage] = useState(0);
  const todoPageSize = mobile ? 5 : 7;
  const todoTasks = tasks.data?.tasks ?? [];
  const todoPageCount = Math.ceil(todoTasks.length / todoPageSize);

  useEffect(() => {
    setUpcomingPage((page) => Math.min(page, Math.max(0, upcomingPageCount - 1)));
  }, [mobile, upcoming.data, upcomingPageCount]);

  useEffect(() => {
    setTodoPage((page) => Math.min(page, Math.max(0, todoPageCount - 1)));
  }, [mobile, tasks.data, todoPageCount]);

  const projectById = new Map((projects.data?.projects ?? []).map((p) => [p.id, p]));

  return (
    <div className={`space-y-4 ${mobile ? "pb-20" : ""}`}>
      <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <Card title="Upcoming events" className={mobile ? "order-2 !rounded-lg !p-3" : ""}>
          {upcoming.loading ? (
            <Empty>Loading…</Empty>
          ) : (upcoming.data?.events.length ?? 0) === 0 ? (
            <Empty>Nothing scheduled in the next 90 days.</Empty>
          ) : (
            <>
              <ul className="space-y-1">
                {upcomingEvents
                  .slice(upcomingPage * upcomingPageSize, (upcomingPage + 1) * upcomingPageSize)
                  .map((e) => {
                    const project = e.project_id ? projectById.get(e.project_id) : undefined;
                    return (
                      <li key={e.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cal.openInfo(e)}
                          className="min-w-0 rounded-md p-1.5 text-left text-sm hover:bg-gray-50"
                        >
                          <div className="min-w-0 max-w-full truncate font-medium text-gray-800" title={e.title} aria-label={e.title}>
                            {truncateEventTitle(e.title)}
                          </div>
                          <div className="flex min-w-0 items-center text-xs text-gray-400">
                            <span className="font-medium text-gray-600">{fmtDateTime(e.start_at)}</span>
                          </div>
                        </button>
                        {project && (
                          <Link
                            to={`/w/${workspaceId}/projects/${project.id}`}
                            title={project.name}
                            className="ml-auto inline-flex max-w-24 shrink-0 items-center gap-1 overflow-hidden rounded-lg bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
                          >
                            <span
                              className="h-1 w-1 shrink-0 rounded-lg"
                              style={{ backgroundColor: tabColor(project) }}
                            />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
              </ul>
              {upcomingEvents.length > upcomingPageSize && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <button type="button" aria-label="Previous upcoming events page" disabled={upcomingPage === 0} onClick={() => setUpcomingPage((page) => page - 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Previous</button>
                  <span>Page {upcomingPage + 1} of {upcomingPageCount}</span>
                  <button type="button" aria-label="Next upcoming events page" disabled={upcomingPage >= upcomingPageCount - 1} onClick={() => setUpcomingPage((page) => page + 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Next</button>
                </div>
              )}
            </>
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
            !mobile && (
              <Button onClick={() => cal.openCreate()}>
                <Icon name="plus" />
                New event
              </Button>
            )
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
              {!mobile && (
                <p className="mt-2 text-xs text-gray-400">
                  Click a day to add an event, or an event to view it.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {mobile && (
        <button
          type="button"
          onClick={() => cal.openCreate()}
          aria-label="New event"
          title="New event"
          className="fixed z-30 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-900 text-white shadow-lg hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom) + 1rem)",
            right: "calc(1rem + env(safe-area-inset-right))",
          }}
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      )}

      <Card title="Todo" className={mobile ? "!rounded-lg !p-3" : ""}>
        {tasks.loading ? (
          <Empty>Loading…</Empty>
        ) : (tasks.data?.tasks.length ?? 0) === 0 ? (
          <Empty>Nothing to do</Empty>
        ) : (
          <>
            <ul className="space-y-1">
              {todoTasks
                .slice(todoPage * todoPageSize, (todoPage + 1) * todoPageSize)
                .map((t) => {
                  const project = t.project_id ? projectById.get(t.project_id) : undefined;
                  return (
                <li key={t.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setSelectedTask(t)}
                    title={t.title}
                    aria-label={`View task details: ${t.title}`}
                    className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-1.5 text-left hover:bg-gray-50"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-lg ${
                        t.status === "doing" ? "bg-amber-400" : "bg-gray-300"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-gray-800">{truncateTitle(t.title, 30)}</span>
                    {t.due_date && <span className="shrink-0 text-xs font-medium text-gray-600">{fmtDate(t.due_date)}</span>}
                    {t.assignee_name && <span className="max-w-24 shrink-0 truncate text-xs text-gray-400">{t.assignee_name}</span>}
                  </button>
                  {(() => {
                    const linked = t.resource_id ? resourceById.get(t.resource_id) : undefined;
                    if (!linked) return null;
                    return (
                      <span className={`inline-flex min-w-0 items-center gap-1 ${mobile ? "shrink-0" : "max-w-40"}`}>
                        <a
                          href={resourceLink(workspaceId, linked)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Open ${linked.name}`}
                          aria-label={`Open attached file ${linked.name}`}
                          className={mobile ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500 hover:bg-gray-200" : "inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-lg bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200"}
                        >
                          <Icon name={linked.type === "url" ? "link" : "file"} className="h-3 w-3 shrink-0" />
                          {!mobile && <span className="truncate">{linked.name}</span>}
                        </a>
                        {!mobile && isPdfResource(linked) && (
                          <button type="button" onClick={() => setViewingPdf(linked)} title="Open in PDF reader" aria-label="Open in PDF reader" className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                            <Icon name="book-open" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    );
                  })()}
                  {project && (
                    <Link
                      to={`/w/${workspaceId}/projects/${project.id}`}
                      title={project.name}
                      className="ml-auto inline-flex max-w-28 shrink-0 items-center gap-1 overflow-hidden rounded-lg bg-gray-100 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200"
                    >
                      <span className="h-1 w-1 shrink-0 rounded-lg" style={{ backgroundColor: tabColor(project) }} />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  )}
                  </li>
                );
              })}
            </ul>
            {todoTasks.length > todoPageSize && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                <button type="button" aria-label="Previous todo page" disabled={todoPage === 0} onClick={() => setTodoPage((page) => page - 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Previous</button>
                <span>Page {todoPage + 1} of {todoPageCount}</span>
                <button type="button" aria-label="Next todo page" disabled={todoPage >= todoPageCount - 1} onClick={() => setTodoPage((page) => page + 1)} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40">Next</button>
              </div>
            )}
          </>
        )}
      </Card>

      {selectedTask && (() => {
        const project = selectedTask.project_id ? projectById.get(selectedTask.project_id) : undefined;
        const linked = selectedTask.resource_id ? resourceById.get(selectedTask.resource_id) : undefined;
        return (
          <Modal open centered title="Task details" onClose={() => setSelectedTask(null)}>
            <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
              <h3 className="min-w-0 max-w-full break-words text-base font-semibold text-gray-900 [overflow-wrap:anywhere]">
                {selectedTask.title}
              </h3>
              {selectedTask.description && (
                <p className="min-w-0 max-w-full whitespace-pre-wrap break-words text-sm text-gray-700 [overflow-wrap:anywhere]">
                  {selectedTask.description}
                </p>
              )}
              <dl className="min-w-0 max-w-full space-y-2 text-sm">
                <div className="flex min-w-0 gap-2"><dt className="shrink-0 font-medium text-gray-500">Status</dt><dd className="min-w-0 break-words text-gray-800 [overflow-wrap:anywhere]">{TASK_STATUS_LABEL[selectedTask.status]}</dd></div>
                {selectedTask.due_date && <div className="flex min-w-0 gap-2"><dt className="shrink-0 font-medium text-gray-500">Due</dt><dd className="min-w-0 break-words text-gray-800 [overflow-wrap:anywhere]">{fmtDate(selectedTask.due_date)}</dd></div>}
                {selectedTask.assignee_name && <div className="flex min-w-0 gap-2"><dt className="shrink-0 font-medium text-gray-500">Assignee</dt><dd className="min-w-0 break-words text-gray-800 [overflow-wrap:anywhere]">{selectedTask.assignee_name}</dd></div>}
              </dl>
              {linked && (
                <div className="flex min-w-0 max-w-full items-center gap-1">
                  <a href={resourceLink(workspaceId, linked)} target="_blank" rel="noreferrer" title={linked.name} className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded-lg bg-gray-100 px-2 py-1 text-sm text-gray-700 hover:bg-gray-200">
                    <Icon name={linked.type === "url" ? "link" : "file"} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{linked.name}</span>
                  </a>
                  {isPdfResource(linked) && <button type="button" onClick={() => setViewingPdf(linked)} title="Open in PDF reader" aria-label="Open in PDF reader" className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100"><Icon name="book-open" className="h-3.5 w-3.5" /></button>}
                </div>
              )}
              {project && (
                <Link to={`/w/${workspaceId}/projects/${project.id}`} title={project.name} className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-sm text-blue-600 hover:underline">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-lg" style={{ backgroundColor: tabColor(project) }} />
                  <span className="min-w-0 truncate">Open {project.name}</span>
                </Link>
              )}
            </div>
          </Modal>
        );
      })()}

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

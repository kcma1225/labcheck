import { useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { useMobileThemeOverride } from "../hooks/useTheme";
import { BrandLink, Header } from "./Header";
import { ManageTabsDialog } from "./ManageTabsDialog";
import { ManagePasskeysDialog } from "./ManagePasskeysDialog";
import { InstallButton, NotificationsToggle } from "./PwaControls";
import { ThemeToggleIcon } from "./ThemeToggle";
import { GhostButton, Icon, Modal } from "./ui";
import { tabColor } from "../lib/colors";
import { groupProjects } from "../lib/projects";
import type { Group, Project } from "../../shared/types";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Layout({ workspaceId, workspaceName, children }: {
  workspaceId: string;
  workspaceName: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/w/${workspaceId}`;
  const mobile = useMobileThemeOverride();
  const activeProjectId = location.pathname.match(/\/projects\/([^/]+)/)?.[1] ?? null;
  const projects = useAsync<{ projects: Project[] }>(
    () => api.get(`/workspaces/${workspaceId}/projects`), [workspaceId],
  );
  const groups = useAsync<{ groups: Group[] }>(
    () => api.get(`/workspaces/${workspaceId}/groups`), [workspaceId],
  );
  const sections = groupProjects(projects.data?.projects ?? [], groups.data?.groups ?? []);
  const [sheet, setSheet] = useState<"tabs" | "menu" | null>(null);
  const [managing, setManaging] = useState(false);
  const [managingPasskeys, setManagingPasskeys] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* Memory-only preference. */ }
  }

  useLayoutEffect(() => { setSheet(null); }, [location.key, mobile]);

  function refreshTabs() {
    projects.reload();
    groups.reload();
  }

  function launch(action: () => void) {
    flushSync(() => setSheet(null));
    if (mobile) document.querySelector<HTMLElement>('[aria-controls="workspace-menu-sheet"]')?.focus();
    action();
  }

  async function lock() {
    try {
      await api.post(`/workspaces/${workspaceId}/lock`);
    } finally {
      navigate("/");
      window.location.reload();
    }
  }

  const tabList = projects.loading ? (
    <div className="px-3 py-1 text-xs text-gray-400">Loading…</div>
  ) : projects.error ? (
    <div role="alert" className="px-3 py-1 text-sm text-red-600">Unable to load tabs. <button onClick={refreshTabs} className="underline">Retry</button></div>
  ) : sections.length === 0 ? (
    <div className="px-3 py-1 text-xs text-gray-400">No tabs yet.</div>
  ) : (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.group?.id ?? "ungrouped"}>
          <div className="flex min-w-0 items-center gap-1.5 break-words px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {section.group && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tabColor(section.group) }} />}
            <span className="min-w-0 break-words">{section.group?.name ?? "Ungrouped"}</span>
          </div>
          <div className="mt-1 divide-y divide-gray-100">
            {section.projects.map((p) => (
              <Link key={p.id} to={`${base}/projects/${p.id}`} onClick={() => setSheet(null)}
                aria-current={p.id === activeProjectId ? "page" : undefined}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded border px-3 py-2 text-sm md:min-h-0 ${p.id === activeProjectId ? "border-gray-900 text-gray-900" : "border-transparent text-gray-700 hover:bg-gray-100"}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tabColor(p) }} />
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const workspaceControls = (
    <div className="mt-auto space-y-1 border-t border-gray-100 pt-2">
      <InstallButton className="w-full justify-start border-0 px-3 py-2 text-gray-500 hover:bg-gray-100" />
      <NotificationsToggle workspaceId={workspaceId} />
      <button onClick={() => launch(() => setManagingPasskeys(true))} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100">
        <Icon name="key" className="h-3.5 w-3.5 shrink-0" />Passkeys
      </button>
      {!mobile && <GhostButton onClick={lock} aria-label="Lock workspace" title="Lock workspace" className="workspace-lock w-full justify-start px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><Icon name="lock" />Lock workspace</GhostButton>}
    </div>
  );

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-gray-50 text-gray-900 md:flex-row">
      <Header className="bg-white md:hidden" brandTo={base} end={
        <span className="min-w-0 truncate text-sm font-medium text-gray-500">{workspaceName}</span>
      } />
      <aside id="workspace-navigation" aria-label="Workspace navigation" className={`hidden shrink-0 border-r border-gray-200 bg-white md:sticky md:top-0 md:block md:max-h-dvh md:overflow-y-auto ${collapsed ? "md:w-16" : "w-56"}`}>
        <div className={`flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col gap-1 p-4 ${collapsed ? "md:items-center md:px-2" : ""}`}>
          <div className={`mb-4 flex items-center gap-2 ${collapsed ? "md:flex-col" : ""}`}>
            {!collapsed && <BrandLink className="text-lg" to={base} />}
            <GhostButton onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className="hidden shrink-0 px-1.5 py-1 md:ml-auto md:flex">
              <Icon name={collapsed ? "chevron-right" : "chevron-left"} className="h-3.5 w-3.5" />
            </GhostButton>
          </div>
          {!collapsed && <div className="mb-4 flex items-start justify-between gap-2">
            <Link to={base} className="block min-w-0">
              <div className="text-xs uppercase tracking-wide text-gray-400">Workspace</div>
              <div className="truncate font-semibold hover:underline">{workspaceName}</div>
            </Link>
            <div className="hidden shrink-0 items-center gap-1 md:flex">
              <ThemeToggleIcon />
            </div>
          </div>}
          {collapsed ? (
            <NavLink to={base} end title="Dashboard" aria-label="Dashboard" className={({ isActive }) => `flex items-center justify-center rounded border p-2 text-sm ${isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-700 hover:bg-gray-100"}`}><Icon name="calendar" /></NavLink>
          ) : (
            <NavLink to={base} end className={({ isActive }) => `rounded border px-3 py-2 text-sm ${isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-700 hover:bg-gray-100"}`}>Dashboard</NavLink>
          )}
          {!collapsed && <div className="mb-1 mt-4 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tabs</span>
            <div className="hidden items-center gap-1 md:flex">
              <GhostButton onClick={() => setManaging(true)} className="px-1.5 py-1" aria-label="Manage" title="Manage"><Icon name="manage" className="h-3.5 w-3.5" />Manage</GhostButton>
            </div>
          </div>}
          {!collapsed && tabList}
          {!mobile && !collapsed && workspaceControls}
          {!mobile && collapsed && (
            <GhostButton onClick={lock} aria-label="Lock workspace" title="Lock workspace" className="workspace-lock mt-auto px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><Icon name="lock" /></GhostButton>
          )}
        </div>
      </aside>
      <main className="min-w-0 w-full max-w-6xl flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">{children}</main>
      <nav aria-label="Mobile workspace navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden">
        <NavLink to={base} end onClick={() => setSheet(null)} className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 text-xs font-medium focus-visible:outline ${isActive ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"}`}><Icon name="calendar" />Dashboard</NavLink>
        <button type="button" aria-expanded={sheet === "tabs"} aria-controls="workspace-tabs-sheet" aria-haspopup="dialog" aria-current={activeProjectId ? "true" : undefined} onClick={() => setSheet("tabs")} className={`flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 text-xs font-medium focus-visible:outline ${activeProjectId || sheet === "tabs" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"}`}><Icon name="file" />Tabs</button>
        <button type="button" aria-expanded={sheet === "menu"} aria-controls="workspace-menu-sheet" aria-haspopup="dialog" onClick={() => setSheet("menu")} className={`flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 text-xs font-medium focus-visible:outline ${sheet === "menu" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"}`}><Icon name="manage" />Menu</button>
      </nav>
      {mobile && sheet && (
        <Modal bottomSheet id={`workspace-${sheet}-sheet`} open onClose={() => setSheet(null)} title={sheet === "tabs" ? "Tabs" : "Menu"}>
          {sheet === "tabs" ? <nav aria-label="Project tabs">{tabList}</nav> : (
            <div className="space-y-2 [&_button]:min-h-11">
              <GhostButton className="w-full justify-start" onClick={() => launch(() => setManaging(true))}><Icon name="manage" />Manage</GhostButton>
              {workspaceControls}
              <GhostButton className="workspace-lock w-full justify-start" onClick={() => launch(lock)}><Icon name="lock" />Lock workspace</GhostButton>
            </div>
          )}
        </Modal>
      )}
      {managing && (
        <ManageTabsDialog workspaceId={workspaceId} groups={groups.data?.groups ?? []} projects={projects.data?.projects ?? []} activeProjectId={activeProjectId} onClose={() => setManaging(false)} onChanged={refreshTabs} />
      )}
      {managingPasskeys && <ManagePasskeysDialog workspaceId={workspaceId} onClose={() => setManagingPasskeys(false)} />}
    </div>
  );
}

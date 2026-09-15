import { useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { ManageTabsDialog } from "./ManageTabsDialog";
import { ManagePasskeysDialog } from "./ManagePasskeysDialog";
import { NewTabDialog } from "./NewTabDialog";
import { InstallButton, NotificationsToggle } from "./PwaControls";
import { ThemeToggleIcon } from "./ThemeToggle";
import { GhostButton, Icon } from "./ui";
import { tabColor } from "../lib/colors";
import { groupProjects } from "../lib/projects";
import type { Group, Project } from "../../shared/types";

const NAV = [{ to: "", label: "Dashboard", end: true }];

export function Layout({
  workspaceId,
  workspaceName,
  children,
}: {
  workspaceId: string;
  workspaceName: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/w/${workspaceId}`;

  // Layout sits above the nested "projects/:projectId" route, so its own
  // useParams() wouldn't see projectId — read it straight from the URL instead.
  const activeProjectId = location.pathname.match(/\/projects\/([^/]+)/)?.[1] ?? null;

  const projects = useAsync<{ projects: Project[] }>(
    () => api.get(`/workspaces/${workspaceId}/projects`),
    [workspaceId],
  );
  const groups = useAsync<{ groups: Group[] }>(
    () => api.get(`/workspaces/${workspaceId}/groups`),
    [workspaceId],
  );
  const sections = groupProjects(projects.data?.projects ?? [], groups.data?.groups ?? []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingTab, setCreatingTab] = useState(false);
  const [managing, setManaging] = useState(false);
  const [managingPasskeys, setManagingPasskeys] = useState(false);

  function refreshTabs() {
    projects.reload();
    groups.reload();
  }

  async function lock() {
    try {
      await api.post(`/workspaces/${workspaceId}/lock`);
    } finally {
      navigate("/");
      window.location.reload();
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-gray-50 text-gray-900 md:flex-row">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 md:hidden">
        <GhostButton aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? "Close menu" : "Menu"}
        </GhostButton>
        <span className="min-w-0 flex-1 truncate font-semibold">{workspaceName}</span>
        <ThemeToggleIcon />
      </header>
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}
        className={`${menuOpen ? "flex" : "hidden"} w-full shrink-0 flex-col gap-1 overflow-y-auto border-b border-gray-200 bg-white p-4 md:sticky md:top-0 md:flex md:max-h-dvh md:w-56 md:border-b-0 md:border-r`}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <Link to={base} className="min-w-0 block">
            <div className="text-xs uppercase tracking-wide text-gray-400">Workspace</div>
            <div className="truncate font-semibold hover:underline">{workspaceName}</div>
          </Link>
          <ThemeToggleIcon className="shrink-0" />
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.label}
            to={item.to ? `${base}/${item.to}` : base}
            end={item.end}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm ${isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`
            }
          >
            {item.label}
          </NavLink>
        ))}

        <div className="mb-1 mt-4 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tabs</span>
          <div className="flex items-center gap-1">
            <GhostButton onClick={() => setManaging(true)} className="px-1.5 py-1" aria-label="Manage tabs and groups">
              <Icon name="manage" className="h-3.5 w-3.5" />
            </GhostButton>
            <GhostButton onClick={() => setCreatingTab(true)} className="px-1.5 py-1" aria-label="New tab">
              <Icon name="plus" className="h-3.5 w-3.5" />
            </GhostButton>
          </div>
        </div>

        {projects.loading ? (
          <div className="px-3 py-1 text-xs text-gray-400">Loading…</div>
        ) : sections.length === 0 ? (
          <div className="px-3 py-1 text-xs text-gray-400">No tabs yet.</div>
        ) : (
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.group?.id ?? "ungrouped"}>
                <div className="flex min-w-0 items-center gap-1.5 break-words px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {section.group && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tabColor(section.group) }}
                    />
                  )}
                  {section.group?.name ?? "Ungrouped"}
                </div>
                <div className="mt-1 divide-y divide-gray-100">
                  {section.projects.map((p) => (
                    <Link
                      key={p.id}
                      to={`${base}/projects/${p.id}`}
                      className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
                        p.id === activeProjectId ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tabColor(p) }}
                      />
                      <span className="truncate">{p.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-1 border-t border-gray-100 pt-2">
          <InstallButton className="w-full justify-start border-0 px-3 py-2 text-gray-500 hover:bg-gray-100" />
          <NotificationsToggle workspaceId={workspaceId} />
          <button
            onClick={() => setManagingPasskeys(true)}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
          >
            <Icon name="key" className="h-3.5 w-3.5 shrink-0" />
            Passkeys
          </button>
          <button
            onClick={lock}
            className="w-full rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
          >
            Lock workspace
          </button>
        </div>
      </aside>
      <main className="min-w-0 w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>

      {creatingTab && (
        <NewTabDialog
          workspaceId={workspaceId}
          groups={groups.data?.groups ?? []}
          onClose={() => setCreatingTab(false)}
          onCreated={() => {
            setCreatingTab(false);
            refreshTabs();
          }}
        />
      )}

      {managing && (
        <ManageTabsDialog
          workspaceId={workspaceId}
          groups={groups.data?.groups ?? []}
          projects={projects.data?.projects ?? []}
          activeProjectId={activeProjectId}
          onClose={() => setManaging(false)}
          onChanged={refreshTabs}
        />
      )}

      {managingPasskeys && (
        <ManagePasskeysDialog workspaceId={workspaceId} onClose={() => setManagingPasskeys(false)} />
      )}
    </div>
  );
}

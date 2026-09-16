import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { useMobileThemeOverride } from "../hooks/useTheme";
import { Header } from "../components/Header";
import { InstallButton } from "../components/PwaControls";
import { ThemeToggleIcon } from "../components/ThemeToggle";
import type { PublicWorkspaceSummary } from "../../shared/types";

export function Home() {
  const list = useAsync<{ workspaces: PublicWorkspaceSummary[] }>(() => api.get("/workspaces"), []);
  const systemTheme = useMobileThemeOverride(true);
  const workspaces = list.data?.workspaces ?? [];

  return (
    <div className="safe-overlay mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <Header end={
        <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-3">
          <Link to="/admin/create-workspace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900">Admin</Link>
          {!systemTheme && <ThemeToggleIcon className="min-h-11 min-w-11" />}
        </nav>
      } />

      <main className="py-10 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-green-700">Your research, together</p>
            <h2 id="workspaces-heading" className="text-3xl font-medium tracking-tight text-gray-900 sm:text-4xl">Workspaces</h2>
            <p className="mt-3 text-sm text-gray-600">Choose a workspace to continue.</p>
          </div>
          {!list.loading && !list.error && (
            <span aria-label={`${workspaces.length} workspaces`} className="shrink-0 pb-1 text-sm tabular-nums text-gray-500">{String(workspaces.length).padStart(2, "0")}</span>
          )}
        </div>

        <section aria-labelledby="workspaces-heading" aria-busy={list.loading} className="border-y border-gray-200">
          {list.loading ? (
            <p role="status" className="py-10 text-sm text-gray-500">Loading workspaces…</p>
          ) : list.error ? (
            <div role="alert" className="py-8">
              <p className="font-medium text-gray-900">Could not load workspaces.</p>
              <p className="mt-2 text-sm text-gray-600">Check your connection and try again.</p>
              <button type="button" onClick={list.reload} className="mt-4 min-h-11 rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-900 hover:bg-gray-100">Retry</button>
            </div>
          ) : workspaces.length === 0 ? (
            <div role="status" className="py-10">
              <p className="font-medium text-gray-900">No workspaces yet.</p>
              <p className="mt-2 text-sm text-gray-600">An administrator can create the first workspace.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {workspaces.map((ws, index) => (
                <li key={ws.id}>
                  <Link to={`/w/${encodeURIComponent(ws.id)}`} aria-label={`Open ${ws.name}`} className="group flex min-h-24 items-center gap-4 rounded-sm px-2 py-6 hover:bg-gray-100 sm:gap-6 sm:px-4">
                    <span aria-hidden="true" className="hidden w-6 shrink-0 text-xs tabular-nums text-gray-500 sm:block">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 text-lg font-medium text-gray-900 [overflow-wrap:anywhere] sm:text-xl">{ws.name}</span>
                    <span aria-hidden="true" className="flex shrink-0 items-center gap-3 text-sm font-medium text-gray-600 group-hover:text-green-700">Open <span className="text-xl">→</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mt-4 text-xs text-gray-500">Password-protected spaces for your team.</p>
      </main>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 py-4 text-xs text-gray-500">
        <span>Projects. Notes. Progress.</span>
        <InstallButton className="min-h-11" />
      </footer>
    </div>
  );
}

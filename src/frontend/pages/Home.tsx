import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { InstallButton } from "../components/PwaControls";
import { ThemeToggleIcon } from "../components/ThemeToggle";
import { Empty } from "../components/ui";
import type { PublicWorkspaceSummary } from "../../shared/types";

export function Home() {
  const list = useAsync<{ workspaces: PublicWorkspaceSummary[] }>(() => api.get("/workspaces"), []);

  return (
    <div className="safe-overlay mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Graduate Research Workspace</h1>
          <div className="flex shrink-0 items-center gap-2">
            <InstallButton />
            <ThemeToggleIcon />
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          A lightweight, password-protected workspace for research teams — projects,
          calendar and resources.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <p className="mb-3 font-medium">Workspaces</p>
        {list.loading ? (
          <Empty>Loading…</Empty>
        ) : (list.data?.workspaces.length ?? 0) === 0 ? (
          <Empty>No workspaces yet.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.data!.workspaces.map((ws) => (
              <li key={ws.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-gray-800">{ws.name}</span>
                <Link
                  to={`/w/${ws.id}`}
                  className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Administrator?{" "}
        <Link to="/admin/create-workspace" className="font-medium text-gray-900 underline">
          Go to admin page
        </Link>
      </div>
    </div>
  );
}

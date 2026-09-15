import { useMemo, useState } from "react";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Icon, Select } from "./ui";
import { tabColor } from "../lib/colors";
import type { Project, Resource } from "../../shared/types";

/**
 * Link-a-resource picker for the task form. Search covers every resource in
 * the workspace regardless of tab; the tab filter dropdown is a separate,
 * independent narrowing and defaults to the tab the task is being created
 * from (searching still reaches every tab even while a filter is set).
 */
export function ResourcePicker({
  workspaceId,
  projects,
  defaultProjectId,
  value,
  onChange,
}: {
  workspaceId: string;
  projects: Project[];
  /** Tab the task form was opened from — seeds the filter, doesn't restrict search. */
  defaultProjectId: string | null;
  value: Resource | null;
  onChange: (resource: Resource | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tabFilter, setTabFilter] = useState<string>(defaultProjectId ?? "");

  const { data, loading } = useAsync<{ resources: Resource[] }>(
    () => api.get(`/workspaces/${workspaceId}/resources`),
    [workspaceId],
  );

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    const all = data?.resources ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (tabFilter && r.project_id !== tabFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, tabFilter]);

  if (value) {
    const project = value.project_id ? projectById.get(value.project_id) : undefined;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
        <Icon name={value.type === "url" ? "link" : "file"} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        {project && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tabColor(project) }} />
            {project.name}
          </span>
        )}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove linked resource"
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        <Icon name="link" className="h-3.5 w-3.5" />
        Link a resource
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-2">
      <div className="flex items-start gap-2">
        {/* 40:60 split between search and the tab filter, at every width. */}
        <div className="grid min-w-0 flex-1 grid-cols-[2fr_3fr] gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all tabs…"
            className="min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-gray-900"
          />
          <Select value={tabFilter} onChange={(e) => setTabFilter(e.target.value)} className="min-w-0 py-1 text-xs">
            <option value="">All tabs</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto">
        {loading ? (
          <p className="px-1 py-1 text-xs text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-1 py-1 text-xs text-gray-400">No resources found.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((r) => {
              const project = r.project_id ? projectById.get(r.project_id) : undefined;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(r);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    <Icon name={r.type === "url" ? "link" : "file"} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    {project && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tabColor(project) }} />
                        {project.name}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

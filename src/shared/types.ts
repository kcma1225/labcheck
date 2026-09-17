// DTOs shared between the Worker API and the React frontend.

export type TaskStatus = "todo" | "doing" | "done";
export type EventType = "meeting" | "deadline" | "milestone" | "event";
export type ResourceType = "url" | "file";

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
  updated_at: number | null;
}

/** A user-managed, reorderable, colorable folder that tabs can belong to. */
export interface Group {
  id: string;
  workspace_id: string;
  name: string;
  /** #RRGGBB, or null for the default color. */
  color: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number | null;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  group_id: string | null;
  /** #RRGGBB, or null for the default tab color. */
  color: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number | null;
}

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: number | null;
  assignee_name: string | null;
  /** Optional link to a resource anywhere in the workspace (any tab), not just this task's tab. */
  resource_id: string | null;
  created_at: number;
  updated_at: number | null;
}

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  type: EventType;
  start_at: number;
  end_at: number | null;
   /** 0 | 1 — stored as an integer. */
  all_day: number;
  /** #RRGGBB, or null to fall back to the type color. */
  color: string | null;
  location: string | null;
  url: string | null;
  created_at: number;
  updated_at: number | null;
}

export interface Note {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  content: string;
  created_at: number;
  updated_at: number | null;
}

export interface Resource {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  type: ResourceType;
  url: string | null;
  storage_key: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: number;
}

/** A shared mark (bookmark + optional note) on one page of a PDF resource. */
export interface ResourceMark {
  id: string;
  workspace_id: string;
  resource_id: string;
  page_number: number;
  note: string | null;
  created_at: number;
  updated_at: number | null;
}

/** A registered passkey, as exposed to the frontend — never the public key or counter. */
export interface PasskeySummary {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

export interface ApiErrorBody {
  error: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  created_at: number;
  updated_at: number | null;
}

export interface AdminWorkspaceSummary extends WorkspaceSummary {
  public_id: string;
  url: string;
}

/** Public directory entry — no timestamps, matches the unauthenticated /api/workspaces shape. */
export interface PublicWorkspaceSummary {
  id: string;
  name: string;
}


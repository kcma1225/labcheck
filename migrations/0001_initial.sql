CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    BIGINT NOT NULL,
    updated_at    BIGINT
);

CREATE TABLE IF NOT EXISTS workspace_sessions (
    -- id = SHA-256 hex of the random session token held in the cookie.
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    expires_at   BIGINT NOT NULL,
    created_at   BIGINT NOT NULL
);

-- Groups organize tabs in the sidebar — a workspace-scoped, user-managed,
-- reorderable, colorable folder (e.g. "Semester 1"). A tab with no group_id
-- renders under "Ungrouped".
CREATE TABLE IF NOT EXISTS groups (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    color        TEXT,                    -- #RRGGBB, or NULL for the default color
    sort_order   BIGINT NOT NULL DEFAULT 0,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT
);

-- Projects double as the app's "tabs" — a workspace-scoped board (a course, a
-- thesis, ...) that Todo/Notes/Resources/Events are filed under.
CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    group_id     TEXT,                    -- references groups(id); NULL = ungrouped
    color        TEXT,                    -- #RRGGBB, or NULL for the default tab color
    sort_order   BIGINT NOT NULL DEFAULT 0,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT
);

CREATE TABLE IF NOT EXISTS tasks (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL,
    project_id        TEXT,
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL,      -- todo | doing | done
    due_date          BIGINT,
    assignee_name     TEXT,
    resource_id       TEXT,              -- optional link to a resource in this workspace (any tab)
    reminder_sent_at  BIGINT,            -- set once a due-soon push reminder has fired
    created_at        BIGINT NOT NULL,
    updated_at        BIGINT
);

CREATE TABLE IF NOT EXISTS events (
    id                TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL,
    project_id        TEXT,
    title             TEXT NOT NULL,
    description       TEXT,
    type              TEXT NOT NULL,      -- meeting | deadline | milestone | event
    start_at          BIGINT NOT NULL,
    end_at            BIGINT,
    all_day           BIGINT NOT NULL DEFAULT 0,
    color             TEXT,               -- #RRGGBB, or NULL to fall back to the type color
    location          TEXT,
    url               TEXT,
    reminder_sent_at  BIGINT,            -- set once a starting-soon push reminder has fired
    created_at        BIGINT NOT NULL,
    updated_at        BIGINT
);

CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT
);

CREATE TABLE IF NOT EXISTS resources (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id   TEXT,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL,           -- url | file
    url          TEXT,
    storage_key       TEXT,
    mime_type    TEXT,
    file_size    BIGINT,
    created_at   BIGINT NOT NULL
);

-- Shared page marks/notes on a PDF resource — makes Resources a lightweight
-- team annotation surface (mark a page, leave a note on it). Deleted with
-- their resource; visible to the whole workspace like everything else here.
CREATE TABLE IF NOT EXISTS resource_marks (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    resource_id  TEXT NOT NULL,
    page_number  BIGINT NOT NULL,
    note         TEXT,
    created_at   BIGINT NOT NULL,
    updated_at   BIGINT
);

-- Passkeys (WebAuthn) — an alternate way into a workspace besides the shared
-- password. Scoped to the workspace, not to a person (this app has no
-- per-user identity), so each teammate can register their own device's
-- passkey under a name they choose, and any of them unlocks the workspace.
-- Registering one still requires knowing the workspace password first
-- (see POST /passkeys/register) — it's a convenience for next time, not a
-- separate way to grant access.
CREATE TABLE IF NOT EXISTS passkey_credentials (
    id           TEXT PRIMARY KEY,   -- WebAuthn credential ID, base64url
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,      -- user-chosen label, e.g. "Kai's MacBook"
    public_key   TEXT NOT NULL,      -- SPKI DER, base64url
    algorithm    TEXT NOT NULL,      -- 'ES256' | 'RS256'
    counter      BIGINT NOT NULL DEFAULT 0,
    created_at   BIGINT NOT NULL,
    last_used_at BIGINT
);

-- Web Push subscriptions — workspace-scoped like everything else here (no
-- per-user identity): any browser that subscribes for a workspace receives
-- every push sent to that workspace. One row per (endpoint), so re-subscribing
-- the same browser/device just refreshes its keys instead of duplicating.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    endpoint     TEXT NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    created_at   BIGINT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_workspace    ON groups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace  ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_group      ON projects(group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace     ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project       ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date      ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_events_workspace    ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_project      ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_start        ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_notes_workspace     ON notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notes_project       ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_resources_workspace ON resources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_resources_project   ON resources(project_id);
CREATE INDEX IF NOT EXISTS idx_resource_marks_res  ON resource_marks(resource_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace  ON workspace_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires    ON workspace_sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint  ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subs_workspace ON push_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_workspace  ON passkey_credentials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder      ON tasks(reminder_sent_at, due_date);
CREATE INDEX IF NOT EXISTS idx_events_reminder     ON events(reminder_sent_at, start_at);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS resource_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_resource ON tasks(resource_id);

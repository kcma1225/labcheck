ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE workspaces SET public_id = id WHERE public_id IS NULL;
ALTER TABLE workspaces ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_public_id ON workspaces(public_id);

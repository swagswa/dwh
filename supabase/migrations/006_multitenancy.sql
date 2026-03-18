-- Migration: Add multi-tenancy (user_id) to all tables
-- Idempotent: handles partial previous application

-- Step 1: Add user_id columns (IF NOT EXISTS handles re-run)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE credentials ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Step 2: Backfill existing rows — assign to the first registered user
-- (single-user system transitioning to multi-tenant)
UPDATE documents SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL;
UPDATE sync_runs SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL;
UPDATE credentials SET user_id = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL;

-- Delete any rows that couldn't be assigned (no users exist)
DELETE FROM documents WHERE user_id IS NULL;
DELETE FROM sync_runs WHERE user_id IS NULL;
DELETE FROM credentials WHERE user_id IS NULL;

-- Step 3: Make user_id NOT NULL now that all rows are backfilled
ALTER TABLE documents ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sync_runs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE credentials ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Create indexes (IF NOT EXISTS for re-run safety)
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_user_id ON sync_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

-- Step 5: Update unique constraint on documents
-- The old constraint may already be dropped from partial run
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_source_id_key;
-- Drop new constraint too in case of re-run, then re-create
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_user_source_source_id_key;
ALTER TABLE documents ADD CONSTRAINT documents_user_source_source_id_key UNIQUE(user_id, source, source_id);

-- Step 6: Update credentials PK to composite (user_id, id)
-- Check if old PK still exists (may have been dropped in partial run)
ALTER TABLE credentials DROP CONSTRAINT IF EXISTS credentials_pkey;
ALTER TABLE credentials ADD PRIMARY KEY (user_id, id);

-- Step 7: Drop old RLS policies (exact names from migrations 001-005)
DROP POLICY IF EXISTS "authenticated read" ON documents;
DROP POLICY IF EXISTS "authenticated delete documents" ON documents;
DROP POLICY IF EXISTS "authenticated read credentials" ON credentials;
DROP POLICY IF EXISTS "authenticated write credentials" ON credentials;
DROP POLICY IF EXISTS "authenticated update credentials" ON credentials;
DROP POLICY IF EXISTS "authenticated delete credentials" ON credentials;

-- Step 8: New RLS policies — users see only their own data

-- documents
CREATE POLICY "users read own documents" ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users delete own documents" ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- sync_runs: enable RLS read for users (was server-only before)
CREATE POLICY "users read own sync_runs" ON sync_runs FOR SELECT
  USING (auth.uid() = user_id);

-- credentials: users manage their own credentials
CREATE POLICY "users read own credentials" ON credentials FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own credentials" ON credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own credentials" ON credentials FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "users delete own credentials" ON credentials FOR DELETE
  USING (auth.uid() = user_id);

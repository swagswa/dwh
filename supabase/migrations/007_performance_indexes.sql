-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_documents_user_source ON documents(user_id, source);
CREATE INDEX IF NOT EXISTS idx_documents_user_source_created ON documents(user_id, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_user_source_finished ON sync_runs(user_id, source, finished_at DESC);

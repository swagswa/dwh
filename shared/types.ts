export interface Document {
  id: number;
  source: string;
  source_id: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncRun {
  id: number;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  items_synced: number;
  items_skipped: number;
  cursor: string | null;
  error_message: string | null;
}

export interface Credential {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export type Source = 'chatgpt' | 'gmail' | 'telegram' | 'sites' | 'documents';

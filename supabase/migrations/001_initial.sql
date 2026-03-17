create table documents (
  id              bigserial primary key,
  source          text not null,
  source_id       text not null,
  title           text,
  content         text not null,
  metadata        jsonb default '{}',
  content_hash    text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(source, source_id)
);

create index on documents (source);
create index on documents (created_at desc);

create table sync_runs (
  id              bigserial primary key,
  source          text not null,
  started_at      timestamptz default now(),
  finished_at     timestamptz,
  status          text default 'running',
  items_synced    int default 0,
  items_skipped   int default 0,
  cursor          text,
  error_message   text
);

create table credentials (
  id              text primary key,
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  metadata        jsonb default '{}'
);

-- RLS: UI can read documents
alter table documents enable row level security;
create policy "authenticated read" on documents for select
  using (auth.role() = 'authenticated');

-- RLS: server-only tables
alter table credentials enable row level security;
alter table sync_runs enable row level security;

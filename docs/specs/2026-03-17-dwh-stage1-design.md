# DWH Stage 1 - Design Spec

## Overview

Корпоративное хранилище знаний. Этап 1: выгрузка данных из 5 источников в Supabase + UI для просмотра и поиска.

Пользователь системы: 1 человек (клиент).
Язык данных: русский (основной), немного английского.


## Architecture

### Tech Stack

- **Runtime:** Node.js + TypeScript
- **DB:** Supabase (PostgreSQL + pgvector + Auth + Storage)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **UI:** Vite + React + Tailwind + shadcn/ui
- **ChatGPT scraper:** Chrome Extension (Manifest V3)
- **Other scrapers:** Node.js server (Hono)
- **Deployment:** UI - Vercel/Netlify (static), Server - Railway (free tier), Extension - unpacked (dev mode)

### Project Structure

```
dwh/
  extension/          # Chrome Extension (ChatGPT scraper + auto token, Manifest V3)
  server/             # Node.js server (Hono) - all scrapers + API
  web/                # Vite + React UI
  supabase/
    migrations/       # SQL migrations
  shared/             # Shared TypeScript types (Supabase generated)
  package.json
```

### Data Flow

```
Chrome Extension ──────→ Server /sync/*  ──→ Supabase (write)
UI (sync buttons) ─────→ Server /sync/*  ──→ Supabase (write)
UI (browse data) ──────────────────────────→ Supabase (direct read, instant)
UI (semantic search) ──→ Server /api/search → Supabase (needs OpenAI key)
Lovable/external ──────→ Server /api/*   ──→ Supabase (read)
```

- Extension and UI never write to Supabase directly. Server is the only write point (uses service_role key).
- UI reads documents directly via authenticated Supabase JS client (instant, no Railway dependency).
- UI semantic search goes through server (requires OpenAI API key for query embedding).
- External consumers (Lovable, future integrations) access data via server `/api/*` endpoints.

### Server API (Hono on Railway)

```
# Sync (write operations)
POST /sync/chatgpt     # receives data from extension
POST /sync/gmail       # triggers Gmail sync
POST /sync/telegram    # triggers Telegram sync
POST /sync/sites       # triggers site parsing
POST /sync/documents   # upload + parse offline docs
POST /sync/embeddings  # chunk documents + generate embeddings
GET  /sync/status      # current sync status per source

# Auth
POST /auth/gmail       # Gmail OAuth2 callback

# API (read operations — for UI search, Lovable, external consumers)
GET  /api/documents          # list documents (filters: source, search, limit, offset)
GET  /api/documents/:id      # single document with full content
POST /api/search             # semantic search (query → embed → cosine → results)
```

All `/sync/*` and `/auth/*` endpoints protected by Supabase JWT verification (Authorization header). `/api/*` endpoints accept either Supabase JWT or a static API key (`X-API-Key` header) for external consumers like Lovable.

### Async Sync Pattern

Long-running sync operations (Gmail, embeddings) use fire-and-forget pattern:

1. `POST /sync/gmail` → server creates `sync_run` record, returns `{ sync_run_id, status: "started" }` immediately
2. Server processes sync in background (Node.js event loop keeps running)
3. UI polls `GET /sync/status` to track progress
4. On completion/error, server updates `sync_run` record with results

This prevents HTTP timeout issues on long syncs (Gmail: 5000 emails, embeddings: 1000+ chunks).

### Security

- Server: only endpoint with Supabase service_role key
- UI: reads data via Supabase JS client with user JWT (anon key + RLS)
- Extension: sends data to server (not to Supabase directly), authenticated via JWT stored in `chrome.storage.local`
- Extension JWT: auto-refreshed via Supabase client's built-in token refresh on each sync
- Server endpoints: verify Supabase JWT on every request
- Supabase Auth: single email/password account
- RLS: read-only policy for authenticated users on `documents` and `document_chunks` (enables direct UI reads). `credentials` and `sync_runs` have RLS enabled with NO public policies (server-only access via service_role)

### Error Handling

- Each scraper wraps per-item operations in try/catch — a single failed item does not stop the sync
- Errors logged to `sync_runs` table (`error_message` field)
- Failed embeddings: document saved without chunks, retried on next `/sync/embeddings` call
- Client-side timeout: 60 seconds for initial sync request (accounts for Railway cold start). Long-running syncs use async pattern (see Async Sync Pattern section)


## Database Schema

### documents

```sql
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
```

### document_chunks

```sql
create table document_chunks (
  id              bigserial primary key,
  document_id     bigint not null references documents(id) on delete cascade,
  chunk_index     int not null,
  content         text not null,
  embedding       vector(1536),
  token_count     int,
  created_at      timestamptz default now(),

  unique(document_id, chunk_index)
);

create index on document_chunks
  using hnsw (embedding vector_cosine_ops);

create index on document_chunks (document_id);
```

All documents go through chunking. Short documents = 1 chunk. Long documents = N chunks. `documents` is the source of truth for content, `document_chunks` is the search index.

When a document is updated (content_hash changes), old chunks are deleted and new ones created on next `/sync/embeddings` call.

### sync_runs

```sql
create table sync_runs (
  id              bigserial primary key,
  source          text not null,
  started_at      timestamptz default now(),
  finished_at     timestamptz,
  status          text default 'running',
  items_synced    int default 0,
  items_skipped   int default 0,
  cursor          text,                     -- for resumable syncs (Gmail pagination)
  error_message   text
);
```

### credentials

```sql
create table credentials (
  id              text primary key,         -- 'gmail', 'telegram', etc.
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  metadata        jsonb default '{}'
);
```

### RLS Policies

```sql
-- Read-only access for authenticated users (enables direct UI reads)
alter table documents enable row level security;
create policy "authenticated read" on documents for select
  using (auth.role() = 'authenticated');

alter table document_chunks enable row level security;
create policy "authenticated read" on document_chunks for select
  using (auth.role() = 'authenticated');

-- Server-only tables: RLS enabled, no public policies
-- Only accessible via service_role key (server)
alter table credentials enable row level security;
alter table sync_runs enable row level security;
```

Server uses `service_role` key, bypassing RLS for all write and read operations on all tables.

### metadata по источникам

- ChatGPT: `{ "chat_id": "...", "project_id": "...", "message_count": 42, "messages": [{role, content}...] }`
- Gmail: `{ "from": "...", "to": "...", "subject": "...", "labels": [...], "thread_id": "...", "history_id": "..." }`
- Telegram: `{ "channel": "@name", "message_id": 123 }`
- Sites: `{ "url": "https://...", "page_title": "..." }`
- Offline: `{ "filename": "report.pdf", "format": "pdf" }`


## Data Sources

### 1. ChatGPT Business (Chrome Extension)

**Scope:** ~500 chats, 1-2 new/week, main pattern - updating old chats.

**Approach:** Chrome Extension (Manifest V3) that auto-extracts access token and syncs conversations via server.

**Flow:**
1. User clicks extension icon -> "Sync" button
2. Extension does `fetch("https://chatgpt.com/api/auth/session")` - cookies auto-attached
3. Extracts `accessToken` from response
4. `GET /backend-api/conversations?offset=0&limit=28` - paginated list of all chats (repeat with offset for full list)
5. Extension sends full conversation list (id + update_time) to server in one batch request
6. Server compares all update_times against Supabase in one SQL query, returns list of IDs that need syncing
7. Extension fetches only changed/new conversations: `GET /backend-api/conversation/{id}` with 2-3 sec delay between requests (anti-ban)
8. Extension sends each conversation to `POST /sync/chatgpt`
9. Server computes content_hash, upserts to Supabase
10. Server logs result to sync_runs

**User experience:** One button. No tokens, no technical steps.

**Installation:** Unpacked extension via Chrome Developer Mode (for 1 client, no Chrome Web Store needed).

**Dependencies:** None in extension (native fetch). Server handles Supabase writes.

**Risks:** Token expiration (auto-refreshed by extension on each sync), API changes (undocumented API), rate limiting (mitigated by delays).

**Fallback:** pionxzh/chatgpt-exporter (2.3k stars, Tampermonkey) for manual bulk export if extension breaks.

### 2. Gmail (Server endpoint)

**Scope:** 1 mailbox, 1 year depth.

**Approach:** Official Gmail API via OAuth2. `googleapis` npm package (works fine on Node.js server, Deno incompatibility no longer relevant).

**Dependencies:**
- `googleapis` or `@googleapis/gmail` (official Google client)

**OAuth2 Flow:**
1. UI has "Connect Gmail" button
2. Click -> redirect to Google OAuth consent screen
3. Google redirects back with auth code to UI
4. UI sends code to `POST /auth/gmail` on server
5. Server exchanges code for tokens, stores in `credentials` table
6. Google OAuth app in "Testing" mode (up to 100 users, no verification needed)

**Sync Flow:**
1. UI clicks "Sync Gmail" -> `POST /sync/gmail`
2. Server reads tokens from `credentials`, auto-refreshes if expired
3. First sync: `messages.list()` in batches (50 per call), store cursor in `sync_runs`
4. For each message: `messages.get()` with `format=full`, parse headers + body
5. Upsert to Supabase
6. If sync takes too long: save cursor, return partial status, UI can re-trigger
7. Subsequent syncs: `history.list()` with stored `historyId` (fast, only changes)

### 3. Telegram (Server endpoint)

**Scope:** 2 own channels (admin access), <100 messages total.

**Approach:** GramJS (MTProto). Bot API does not have a `getHistory` endpoint for reading past messages.

**Dependencies:**
- `telegram` (GramJS, 80k weekly downloads, works on Node.js)

**Flow:**
1. One-time setup: API ID + API Hash from my.telegram.org, phone verification
2. Server: `client.getMessages("@channel", { limit: 100 })` per channel
3. Upsert to Supabase
4. Store session string in `credentials` table for reuse

**Fallback:** If GramJS breaks, Telegram Desktop has built-in JSON export for channels.

**Note:** Tiny volume (<100 msgs), single invocation sufficient.

### 4. Sites (Server endpoint)

**Scope:** 2 sites + 2 landing pages, no auth, new sites will be added.

**Approach:** HTTP fetch + content extraction.

**Dependencies:**
- `cheerio` (15M downloads/week, HTML parsing)
- `@mozilla/readability` + `jsdom` (content extraction)
- `turndown` (HTML to Markdown)

**Flow:**
1. List of URLs stored in `credentials` table (metadata field) or separate config
2. UI clicks "Sync Sites" -> `POST /sync/sites`
3. Server: for each URL fetch HTML
4. Article pages: Readability extracts main content
5. Landing pages: cheerio with CSS selectors for specific sections
6. Convert to Markdown via turndown
7. Compute content_hash, upsert (skip if unchanged)

### 5. Offline Documents (Server endpoint)

**Scope:** Various formats, few documents, will grow.

**Approach:** Upload to Supabase Storage via UI, server parses and extracts text.

**Dependencies:**
- `unpdf` (PDF, modern TS-first)
- `mammoth` (DOCX, 2M downloads, updated March 2026)
- `exceljs` (XLSX, 5M downloads)
- `officeparser` (PPTX and other formats)

**Flow:**
1. User drags & drops files in UI
2. UI uploads file to Supabase Storage
3. UI calls `POST /sync/documents` with file reference
4. Server downloads from Storage, detects format, extracts text
5. Upsert document to Supabase


## Chunking & Embeddings

All documents are chunked before embedding. No content is truncated — every piece of text gets an embedding.

### Chunking Strategy

| Source | Chunk boundaries | Prefix |
|---|---|---|
| ChatGPT | Groups of messages (~4000 tokens) | Conversation title |
| Gmail | Whole email (most fit in 1 chunk) | Subject + from/to |
| Telegram | As-is (all messages are short) | Channel name |
| Sites | By sections (h2/h3 headings) | Page title |
| Offline (PDF) | By pages | Filename |
| Offline (DOCX) | By headings | Filename |
| Offline (XLSX) | By sheets | Filename + sheet name |

**Parameters:**
- Target chunk size: ~4000 tokens (well within text-embedding-3-small's 8191 limit)
- Overlap: ~200 tokens between chunks (context continuity)
- No minimum — even a 50-token chunk gets its own embedding

### Embedding Flow

`POST /sync/embeddings` processes documents that need (re-)chunking:

1. Find documents without chunks, or where `documents.updated_at` > latest chunk's `created_at`
2. Delete existing chunks for updated documents
3. Split content into chunks using source-specific strategy
4. For each chunk: call OpenAI `text-embedding-3-small`, get 1536-dim vector
5. Insert chunks with embeddings into `document_chunks`
6. If OpenAI call fails for a chunk, skip it — retried on next run

Called automatically after each scraper completes.

### Semantic Search Flow

`POST /api/search` (used by UI and external consumers):

1. Receive query text
2. Embed query via OpenAI `text-embedding-3-small`
3. Cosine similarity search on `document_chunks`
4. Join to `documents` for full document info
5. Deduplicate (multiple chunks from same document → single result, best score)
6. Return ranked results

### Cost Estimate

~500 chats × ~2000 tokens + ~5000 emails × ~500 tokens + overlap from chunking ≈ ~5M tokens = ~$0.10 for initial load. Pennies for ongoing updates.


## UI

Single-page Vite + React application.

**Layout:**
- Top: source cards (ChatGPT, Gmail, TG, Sites, Docs) with stats + sync buttons
- ChatGPT card: "Sync via Chrome extension" badge (no button, sync happens in extension)
- Middle: documents table with filters (by source, by ChatGPT project, text search)
- Click row: modal with full document content
- Settings panel (expandable): Gmail OAuth connect, TG credentials, site URLs, file upload zone

**Auth:** Supabase Auth with single email/password account. UI shows login screen, after auth - full access.

**Stack:**
- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase JS client (reads data directly, auth)
- Calls server `/api/search` for semantic search
- Calls server `/sync/*` for sync operations
- Deploy: any static hosting (Vercel, Netlify, Cloudflare Pages)


## Incremental Sync Strategy

| Source | How we detect changes |
|---|---|
| ChatGPT | `update_time` from API vs stored `updated_at` |
| Gmail | `history.list()` with stored `historyId` |
| Telegram | Compare last stored `message_id` with latest |
| Sites | `content_hash` comparison |
| Offline | New uploads only (manual) |

When a document's `content_hash` changes on re-sync, `updated_at` is bumped. Next `/sync/embeddings` call detects stale chunks and re-creates them.


## Deployment Notes

- **Server (Railway free tier):** 500 hours/month, sleeps after inactivity. Cold start ~30-60 sec on first sync. Acceptable for weekly/daily sync pattern. UI reads don't depend on server (direct Supabase).
- **UI (Vercel/Netlify):** Free tier, static hosting, always available.
- **Extension:** Distributed as ZIP, installed via Chrome Developer Mode. No Chrome Web Store needed for 1 client.
- **Google OAuth:** "Testing" mode, up to 100 test users without Google verification.
- **Supabase free tier:** 500MB database, 1GB storage, sufficient for Stage 1 volumes.


## External Integration (Lovable)

Client builds automations in Lovable (AI app builder). Lovable apps can access DWH data via server `/api/*` endpoints, authenticated with a static API key (`X-API-Key` header, stored as `DWH_API_KEY` env var on Railway).

Available endpoints:
- `GET /api/documents` — list/filter documents
- `GET /api/documents/:id` — full document content
- `POST /api/search` — semantic search

Exact integration details TBD — depends on client providing access to their Lovable setup. The API is ready; wiring up happens after Stage 1 core is deployed.


## Future-Proofing for Stage 2 (RAG)

- `document_chunks` table with embeddings already in place — Stage 2 RAG uses existing infrastructure
- `metadata.messages` stores ChatGPT dialog structure for potential re-chunking strategies
- HNSW index ready for semantic search at scale
- RPC function `match_documents` can be added as a thin wrapper over existing chunks search
- Semantic search endpoint (`POST /api/search`) is the foundation for RAG pipeline


## Known Limitations

- `content` and `metadata.messages` store overlapping data for ChatGPT. Acceptable tradeoff for simplicity.
- Railway cold start ~30-60 sec on first request after sleep. Does not affect UI browsing (direct Supabase reads).
- ChatGPT API is undocumented and may change without notice.
- GramJS last updated February 2025, but MTProto protocol is stable.
- Credentials (Gmail tokens, Telegram session) stored unencrypted in database. Acceptable for single-user system; encryption deferred.


## Out of Scope (Stage 2)

- RAG system (LLM-powered answers over search results)
- Factories (BusDev, Consulting) bidirectional sync
- Output channels (site stats, AI assistants)
- Automated scheduling (cron/orchestrator)
- Credentials encryption

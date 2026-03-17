# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DWH (Data Warehouse) — corporate knowledge management system. Collects data from 5 sources into Supabase, displays in a web UI. Built for a single non-technical client — UX must be dead simple.

**Stage 1** (current): data ingestion + UI. No embeddings, no search, no RAG.
**Stage 2** (future): chunking, embeddings, semantic search, RAG, external integrations.

## Tech Stack

- **Monorepo:** npm workspaces (`web/`, `shared/`)
- **Backend:** Supabase Edge Functions (Deno runtime)
- **Frontend:** Vite 8 + React 19 + TypeScript 5.9 + Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **Chrome Extension:** Manifest V3
- **Shared types:** `shared/types.ts` — `Document`, `SyncRun`, `Credential`, `Source`

## Commands

### Web (`web/`)
```bash
npm run dev       # Vite dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # ESLint (flat config: TS + React Hooks)
```

### Edge Functions (`supabase/functions/`)
```bash
supabase functions serve              # Local dev server
supabase functions deploy             # Deploy all functions
supabase functions deploy <name>      # Deploy single function
supabase secrets set KEY=value        # Set env vars
```

### Root
```bash
npm install       # Install all workspace dependencies
```

## Architecture

### Data Flow
```
Chrome Extension ──> Edge Functions ──> Supabase (service_role, writes)
UI (sync buttons) ─> Edge Functions ──> Supabase (service_role, writes)
UI (read data) ──────────────────────> Supabase JS client (anon key + RLS, reads)
```

Two services only: **Supabase** (DB + Auth + Edge Functions) + **Vercel** (static UI).

### Database (3 tables)
- **documents** — all ingested content, UNIQUE(source, source_id). RLS: authenticated read.
- **sync_runs** — sync operation logs. Server-only (RLS, no public policies).
- **credentials** — OAuth tokens per source. Server-only (RLS, no public policies).

### Edge Functions (`supabase/functions/`)
- `_shared/` — auth, supabase client, CORS helpers
- `sync-status` — GET document counts + last sync per source
- `sync-chatgpt` — POST receive conversations from extension
- `sync-gmail` — POST batch Gmail sync (cursor pattern, 50/call)
- `auth-gmail` — GET OAuth URL, POST exchange code for tokens
- `sync-sites` — POST fetch + parse website content
- `sync-documents` — POST parse uploaded files (PDF, DOCX, XLSX, TG JSON)

### Batch Sync Pattern
Long-running syncs use cursor/batch pattern (no timeouts):
1. UI calls Edge Function → processes 1 page (50 items) → returns `{ synced, cursor, done }`
2. UI calls again with cursor → next page
3. Repeat until `done: true`

### Security
- Edge Functions: Supabase JWT verification via `_shared/auth.ts`
- UI: Supabase Auth (single email/password account)
- Extension: Supabase Auth login in popup, JWT in chrome.storage

## Key Specs & Plans

- **Design spec:** `docs/specs/2026-03-17-dwh-stage1-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-03-17-dwh-stage1-implementation.md`
- **Progress tracker:** `docs/PROGRESS.md`

## Deployment

| Component | Platform |
|-----------|----------|
| Edge Functions + DB | Supabase (free tier) |
| Web UI | Vercel (free tier) |
| Extension | ZIP, unpacked via Chrome Developer Mode |

## Conventions

- ESM throughout
- TypeScript strict mode, shared base config in `tsconfig.base.json`
- Edge Functions use Deno runtime with `npm:` specifiers for npm packages
- Client-facing docs in Russian; code and comments in English
- Analysis/reports in `claudedocs/`; tests in `tests/`
- Never commit `.env`

# DWH Stage 1 — Progress Tracker

## Overall Progress

```
████████████████░░░░ 85% (7/8 tasks done, 1 partial)
```

**Started:** 2026-03-17
**Last updated:** 2026-03-18

---

## Tasks

| # | Task | Status | Details |
|---|------|--------|---------|
| 1 | Scaffolding + Supabase | ✅ Done | Monorepo, migrations, shared types |
| 2 | Edge Functions base + sync-status | ✅ Done | Auth, CORS helpers, sync-status endpoint |
| 3 | ChatGPT sync | ✅ Done | sync-chatgpt + sync-chatgpt-check |
| 4 | Gmail OAuth + sync | ✅ Done | auth-gmail + sync-gmail (cursor/batch) |
| 5 | Sites + Documents sync | ✅ Done | sync-sites (cheerio+turndown), sync-documents (PDF, DOCX, XLSX, TG JSON) |
| 6 | Chrome Extension | ✅ Done | Manifest V3, ChatGPT scraper, Supabase auth |
| 7 | Web UI | ✅ Done | Login, Dashboard, Search, Documents, Settings pages |
| 8 | Deploy | ⏳ Partial | Local verified, production deploy pending |

---

## Verified Locally (via curl)

- **sync-status:** returns source counts + last sync per source
- **sync-chatgpt:** mock data upsert works, idempotent
- **sync-chatgpt-check:** delta detection correct
- **auth-gmail:** OAuth URL generation works, error handling correct
- **sync-gmail:** error handling when no credentials
- **sync-sites:** cheerio+turndown parsing, idempotency via SHA-256 hash
- **sync-documents:** txt, Telegram JSON, generic JSON all parse correctly

## Bugs Found and Fixed

- **sync-sites:** MD5 → SHA-256 (Deno Web Crypto API incompatibility)
- **extension/popup.js:** added HTTP error checks for Edge Function responses
- **web:** ESLint config fix for shadcn constant exports, SearchPage setState pattern

## What Remains for Production

- [ ] Deploy Edge Functions: `supabase functions deploy`
- [ ] Set production secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
- [ ] Deploy web to Vercel
- [ ] Manual testing: Gmail OAuth flow, Chrome Extension in browser
- [ ] Smoke test all 13 scenarios from the checklist

---

## Log

| Date | What | Notes |
|------|------|-------|
| 2026-03-17 | Project kickoff | Design spec ready, plan written |
| 2026-03-17 | Tasks 1–6 completed | Backend + extension fully built |
| 2026-03-18 | Task 7 completed | Web UI: login, dashboard, search, documents, settings |
| 2026-03-18 | Task 8 partial | Local verification done, production deploy pending |
| 2026-03-18 | Final cleanup | Lint/typecheck pass, production build OK, artifacts cleaned |

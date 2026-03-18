# DWH Stage 1 — Verification & Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every feature works end-to-end, fix bugs found during testing, ensure all Edge Functions are deployed and connected to the UI.

**Architecture:** Supabase (DB + Auth + Edge Functions) + Vite React UI + Chrome Extension. Two services: Supabase + Vercel.

**Tech Stack:** Supabase Edge Functions (Deno), Vite + React 19 + TypeScript + Tailwind, Chrome Extension Manifest V3.

**Approach:** Go feature-by-feature. For each feature: verify Edge Function locally → fix bugs → deploy → verify from UI → mark done. No new features — only verification and bugfixes.

---

## Prerequisites

Before starting any task, ensure:

1. Supabase CLI installed (`supabase --version`)
2. Supabase project linked (`supabase link --project-ref <ref>`)
3. `.env.local` in `web/` with correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Supabase secrets set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
5. A user created in Supabase Auth (Dashboard → Authentication → Create user)
6. Migration applied (SQL Editor → paste `001_initial.sql` → Run)
7. Storage bucket "documents" created (from migration or manually)

---

## File Structure

No new files are created. This plan verifies and fixes existing files:

```
supabase/functions/
  _shared/cors.ts, auth.ts, supabase.ts, response.ts
  sync-status/index.ts
  sync-chatgpt/index.ts
  sync-chatgpt-check/index.ts
  auth-gmail/index.ts
  sync-gmail/index.ts
  sync-sites/index.ts          ← BUG: uses MD5, not supported in Deno
  sync-documents/index.ts
web/src/
  App.tsx
  components/*.tsx
  lib/supabase.ts              ← has hardcoded fallback keys
extension/
  popup.js, background.js      ← hardcoded Supabase keys
```

---

## Task 1: Build & Local Dev Smoke Test

**Goal:** Verify the web app compiles, starts, and renders the login page.

**Files:**
- Check: `web/package.json`, `web/src/App.tsx`, `web/src/lib/supabase.ts`
- Check: `web/.env` or `web/.env.local` (Supabase credentials)

- [ ] **Step 1: Install dependencies**

```bash
cd E:/1.projects/dwh
npm install
```

Expected: No errors. `node_modules/` created in root and `web/`.

- [ ] **Step 2: Run TypeScript build check**

```bash
cd web
npx tsc -b --noEmit
```

Expected: No type errors. If errors — fix them before proceeding.

- [ ] **Step 3: Run ESLint**

```bash
cd web
npm run lint
```

Expected: No critical errors. Warnings acceptable.

- [ ] **Step 4: Start dev server**

```bash
cd web
npm run dev
```

Expected: Vite starts on http://localhost:5173. Open in browser — LoginPage renders (dark theme, "DWH" logo, email/password fields).

- [ ] **Step 5: Verify .env has real Supabase credentials**

Check `web/.env` or `web/.env.local`:
```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

If missing — create from `.env.example` with real values from Supabase Dashboard → Settings → API.

- [ ] **Step 5b: Verify .env is NOT tracked by git**

Check `.gitignore` contains `web/.env` or `.env`. If `web/.env` is tracked:
```bash
echo "web/.env" >> .gitignore
git rm --cached web/.env
```

This prevents leaking Supabase keys. Use `web/.env.local` for local dev (Vite auto-loads it).

- [ ] **Step 5c: Verify `web/src/lib/api.ts` — edgeFetch wrapper**

Read `web/src/lib/api.ts`. Verify:
1. It builds the correct URL: `${VITE_SUPABASE_URL}/functions/v1/${fn}`
2. It injects `Authorization: Bearer <token>` from Supabase session
3. It sets `Content-Type: application/json`

This is the bridge between UI and all Edge Functions — if broken, no sync button works.

- [ ] **Step 6: Test login**

Enter the email/password of the Supabase Auth user created in prerequisites.
Expected: Login succeeds → redirects to Dashboard page with sidebar navigation.

- [ ] **Step 7: Verify Dashboard renders**

After login, the dashboard should show 5 source cards (ChatGPT, Gmail, Telegram, Sites, Documents) — all with "0 documents" and no last sync.

- [ ] **Step 8: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: build and startup issues"
```

---

## Task 2: Edge Functions — Shared Helpers + sync-status

**Goal:** Verify `_shared/` helpers and `sync-status` work locally and after deploy.

**Files:**
- Verify: `supabase/functions/_shared/cors.ts`
- Verify: `supabase/functions/_shared/auth.ts`
- Verify: `supabase/functions/_shared/supabase.ts`
- Verify: `supabase/functions/_shared/response.ts`
- Verify: `supabase/functions/sync-status/index.ts`

- [ ] **Step 1: Verify _shared/ helpers compile**

Read each file in `supabase/functions/_shared/` and verify:
- `cors.ts` — exports `corsHeaders` object and `corsResponse()` function
- `auth.ts` — imports from `./supabase.ts`, exports `verifyAuth(req)`
- `supabase.ts` — exports `getServiceClient()` and `getAnonClient()`
- `response.ts` — imports from `./cors.ts`, exports `jsonResponse()` and `errorResponse()`

All Edge Functions import from these. If any has a typo — every function breaks.

- [ ] **Step 2: Start Edge Functions locally**

```bash
cd E:/1.projects/dwh
supabase functions serve
```

Expected: Functions start serving. Check terminal for errors.

- [ ] **Step 3: Get a JWT token for testing**

Get the access token from web app (browser DevTools → Application → Local Storage → `sb-<ref>-auth-token` → `access_token`).

Or use curl:
```bash
curl -X POST "https://<project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"<user-email>","password":"<password>"}'
```

Save the `access_token` for subsequent steps.

- [ ] **Step 4: Test sync-status locally**

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:54321/functions/v1/sync-status
```

Expected: JSON with 5 sources, all `count: 0`, all `lastSync: null`:
```json
{
  "chatgpt": { "count": 0, "lastSync": null },
  "gmail": { "count": 0, "lastSync": null },
  ...
}
```

- [ ] **Step 5: Test CORS (OPTIONS request)**

```bash
curl -X OPTIONS http://localhost:54321/functions/v1/sync-status -v
```

Expected: 200 OK with `Access-Control-Allow-Origin: *` header.

- [ ] **Step 6: Test auth rejection**

```bash
curl http://localhost:54321/functions/v1/sync-status
```

Expected: 401 `{ "error": "Missing authorization" }`

- [ ] **Step 7: Deploy sync-status**

```bash
supabase functions deploy sync-status
```

Expected: Deployed successfully.

- [ ] **Step 8: Test deployed sync-status**

```bash
curl -H "Authorization: Bearer <jwt>" https://<project>.supabase.co/functions/v1/sync-status
```

Expected: Same response as local.

- [ ] **Step 9: Verify Dashboard fetches sync-status**

Open web app → Dashboard. Open DevTools → Network tab. Check that `sync-status` call returns 200 and cards show "0 documents".

- [ ] **Step 10: Commit if any fixes were needed**

---

## Task 3: Edge Functions — ChatGPT Sync (sync-chatgpt-check + sync-chatgpt)

**Goal:** Verify ChatGPT sync endpoints work. Test with mock data (no extension needed).

**Files:**
- Verify: `supabase/functions/sync-chatgpt-check/index.ts`
- Verify: `supabase/functions/sync-chatgpt/index.ts`

- [ ] **Step 1: Test sync-chatgpt with mock conversation**

```bash
curl -X POST http://localhost:54321/functions/v1/sync-chatgpt \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "conversations": [{
      "id": "test-conv-1",
      "title": "Test Conversation",
      "mapping": {
        "node1": {
          "message": {
            "author": { "role": "user" },
            "content": { "parts": ["Hello, how are you?"] }
          }
        },
        "node2": {
          "message": {
            "author": { "role": "assistant" },
            "content": { "parts": ["I am fine, thank you!"] }
          }
        }
      }
    }]
  }'
```

Expected: `{ "synced": 1 }`

**Note:** This also creates a `sync_runs` record (source='chatgpt', status='completed', items_synced=1).

- [ ] **Step 2: Verify document appeared in Supabase**

Supabase Dashboard → Table Editor → documents.
Expected: 1 row with source='chatgpt', source_id='test-conv-1', title='Test Conversation'.

- [ ] **Step 3: Verify sync_run was logged**

Supabase Dashboard → Table Editor → sync_runs.
Expected: 1 row with source='chatgpt', status='completed', items_synced=1.

- [ ] **Step 4: Test sync-chatgpt-check (delta detection)**

```bash
curl -X POST http://localhost:54321/functions/v1/sync-chatgpt-check \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "items": [
    { "id": "test-conv-1", "update_time": 0 },
    { "id": "test-conv-2", "update_time": 9999999999 }
  ]}'
```

Expected: `test-conv-1` should NOT be in `needed_ids` (already synced, update_time=0 is older). `test-conv-2` should be in `needed_ids` (doesn't exist).
```json
{ "needed_ids": ["test-conv-2"], "total": 2, "needed": 1 }
```

- [ ] **Step 5: Test validation — empty array**

```bash
curl -X POST http://localhost:54321/functions/v1/sync-chatgpt \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "conversations": [] }'
```

Expected: 400 error `"conversations: non-empty array required"`

- [ ] **Step 6: Test idempotency — re-send same conversation**

Re-run Step 1 curl. Expected: `{ "synced": 1 }` (upsert, no duplicate).
Check documents table — still 1 row, not 2.

- [ ] **Step 7: Verify Dashboard updates**

Open web app → Dashboard. ChatGPT card should now show "1 document" with last sync time.

- [ ] **Step 8: Deploy both functions**

```bash
supabase functions deploy sync-chatgpt
supabase functions deploy sync-chatgpt-check
```

- [ ] **Step 9: Commit if any fixes were needed**

---

## Task 4: Edge Functions — Gmail OAuth (auth-gmail)

**Goal:** Verify Gmail OAuth flow works: get URL → redirect → exchange code → store tokens.

**Files:**
- Verify: `supabase/functions/auth-gmail/index.ts`
- Verify: `web/src/App.tsx` (OAuth callback handling)
- Verify: `web/src/components/SettingsPage.tsx` (Connect Gmail button)

**Prerequisites:**
- Google Cloud Console project with Gmail API enabled
- OAuth 2.0 Client ID (Web application type)
- Authorized redirect URI: `http://localhost:5173/auth/gmail/callback`
- Supabase secrets set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

- [ ] **Step 1: Test GET auth-gmail (get OAuth URL)**

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:54321/functions/v1/auth-gmail
```

Expected: JSON with a Google OAuth URL:
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&scope=...gmail.readonly..." }
```

Verify the URL contains correct `client_id`, `redirect_uri`, `scope=gmail.readonly`.

- [ ] **Step 2: Test the full OAuth flow manually**

1. Open the URL from Step 1 in browser
2. Sign in with Google → authorize
3. Google redirects to `http://localhost:5173/auth/gmail/callback?code=<auth-code>`
4. Check if App.tsx catches the code and calls auth-gmail POST

- [ ] **Step 3: Verify App.tsx handles the callback**

Read `web/src/App.tsx` — find the code handling `?code=` in URL params.
It should:
1. Extract `code` from URL
2. POST to `auth-gmail` with `{ code }`
3. Clear the URL params
4. Show success or redirect to settings

If the callback handling is broken or missing — fix it.

- [ ] **Step 4: Verify credentials stored**

After OAuth flow completes:
Supabase Dashboard → Table Editor → credentials.
Expected: Row with id='gmail', access_token and refresh_token populated.

- [ ] **Step 5: Verify Settings page shows Gmail connected**

Open web app → Settings. Gmail section should show "Connected" status (or similar) instead of "Connect" button.

- [ ] **Step 6: Deploy auth-gmail**

```bash
supabase functions deploy auth-gmail
```

- [ ] **Step 7: Commit if any fixes were needed**

---

## Task 5: Edge Functions — Gmail Sync (sync-gmail)

**Goal:** Verify Gmail sync works with cursor pagination. Requires Gmail connected (Task 4).

**Files:**
- Verify: `supabase/functions/sync-gmail/index.ts`
- Verify: `web/src/components/DashboardPage.tsx` (sync loop logic)

**Prerequisites:** Gmail OAuth completed (Task 4), credentials in DB.

- [ ] **Step 1: Test sync-gmail locally (first page)**

```bash
curl -X POST http://localhost:54321/functions/v1/sync-gmail \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: JSON with synced emails:
```json
{ "synced": 50, "skipped": 0, "cursor": "<nextPageToken>", "done": false }
```

Or if fewer than 50 emails: `{ "synced": N, "skipped": 0, "cursor": null, "done": true }`

- [ ] **Step 2: Verify emails in database**

Supabase Dashboard → documents. Filter by source='gmail'.
Expected: Rows with subject as title, email content, metadata with from/to/subject.

- [ ] **Step 3: Test cursor pagination (second page)**

If Step 1 returned a cursor:
```bash
curl -X POST http://localhost:54321/functions/v1/sync-gmail \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "cursor": "<cursor-from-step-1>" }'
```

Expected: Next batch of emails, new cursor or `done: true`.

- [ ] **Step 4: Test token refresh**

If Gmail token has expired, sync-gmail should auto-refresh using refresh_token.
Check credentials table — `access_token` and `expires_at` should be updated.

- [ ] **Step 5: Verify Dashboard sync button works**

Open web app → Dashboard → click "Sync" on Gmail card.
Expected: Progress indicator shows, card updates with new count after sync completes.

Check DashboardPage.tsx — it should loop calling sync-gmail until `done: true`.

- [ ] **Step 6: Deploy sync-gmail**

```bash
supabase functions deploy sync-gmail
```

- [ ] **Step 7: Commit if any fixes were needed**

---

## Task 6: Edge Functions — Sites Sync (sync-sites)

**Goal:** Verify site scraping works. **KNOWN BUG: MD5 hash not supported in Deno Web Crypto API — must fix to SHA-256.**

**Files:**
- Fix: `supabase/functions/sync-sites/index.ts` (line ~65: `crypto.subtle.digest('MD5', ...)`)
- Verify: `web/src/components/SettingsPage.tsx` (URL list management)
- Verify: `web/src/components/DashboardPage.tsx` (sync sites button)

- [ ] **Step 1: Fix MD5 → SHA-256 bug in sync-sites**

In `supabase/functions/sync-sites/index.ts`, find:
```typescript
const hashBuf = await crypto.subtle.digest('MD5', encoder.encode(content))
```

Replace with:
```typescript
const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(content))
```

This is a blocker — the function will crash without this fix.

- [ ] **Step 2: Test sync-sites locally with inline URLs**

```bash
curl -X POST http://localhost:54321/functions/v1/sync-sites \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "urls": ["https://example.com"] }'
```

Expected: `{ "synced": 1, "skipped": 0, "total": 1 }`

- [ ] **Step 3: Verify document in database**

Supabase Dashboard → documents. Filter by source='sites'.
Expected: 1 row, source_id = the URL, content = Markdown version of page.

- [ ] **Step 4: Test idempotency — re-sync same URL**

Re-run Step 2. Expected: `{ "synced": 0, "skipped": 1, "total": 1 }` (hash unchanged).

- [ ] **Step 5: Test URL list from Settings page**

1. Open web app → Settings → Sites section
2. Add a URL (e.g., "https://example.com")
3. Save — should write to credentials table (id='sites', metadata.urls=[...])
4. Go to Dashboard → click "Sync" on Sites card
5. Expected: Sites sync runs, pulls content from saved URLs

Verify SettingsPage saves URLs correctly to credentials table.

- [ ] **Step 6: Deploy sync-sites**

```bash
supabase functions deploy sync-sites
```

- [ ] **Step 7: Commit the MD5→SHA-256 fix + any other fixes**

```bash
git add supabase/functions/sync-sites/index.ts
git commit -m "fix: sync-sites use SHA-256 instead of unsupported MD5 in Deno"
```

---

## Task 7: Edge Functions — Document Upload (sync-documents)

**Goal:** Verify file upload → Storage → parse flow for all supported formats.

**Files:**
- Verify: `supabase/functions/sync-documents/index.ts`
- Verify: `web/src/components/SettingsPage.tsx` (file upload section)

**Prerequisites:** Storage bucket "documents" exists in Supabase.

- [ ] **Step 1: Verify Storage bucket exists**

Supabase Dashboard → Storage. Check "documents" bucket exists.
If not — create it (or run the SQL from migration: `insert into storage.buckets...`).

- [ ] **Step 2: Test sync-documents via curl (independent of UI)**

First, upload a test file to Supabase Storage manually (Dashboard → Storage → documents bucket → Upload → `test.txt`).

Then call the Edge Function directly:
```bash
curl -X POST http://localhost:54321/functions/v1/sync-documents \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "file_path": "test.txt", "filename": "test.txt" }'
```

Expected: `{ "synced": 1, "format": "txt" }`

This isolates the Edge Function from UI upload logic. If this fails, fix the function before testing the UI.

- [ ] **Step 3: Test file upload from Settings page**

1. Open web app → Settings → File Upload section
2. Create a test file `test.txt` with content "Hello from DWH test"
3. Drag & drop into upload zone
4. Expected: File uploads to Storage, sync-documents is called, status shows "success"

- [ ] **Step 4: Verify document in database**

Supabase Dashboard → documents. Filter by source='documents'.
Expected: 1 row with title='test.txt', content='Hello from DWH test'.

- [ ] **Step 5: Test Telegram JSON upload**

Create a file `telegram_export.json`:
```json
{
  "name": "Test Channel",
  "messages": [
    { "id": 1, "text": "First message", "date": "2026-01-15T10:30:00" },
    { "id": 2, "text": "Second message", "date": "2026-01-15T11:00:00" }
  ]
}
```

Upload via Settings → File Upload.
Expected: 2 documents created with source='telegram'.

- [ ] **Step 6: Verify Telegram documents in DB**

Supabase Dashboard → documents. Filter by source='telegram'.
Expected: 2 rows with source_id like 'Test Channel_1', 'Test Channel_2'.

- [ ] **Step 7: Test generic JSON file (non-Telegram)**

Upload a file `data.json` with content `{ "key": "value" }` (no `messages` array).
Expected: Stored as source='documents' (not 'telegram'), content is the raw JSON text.

- [ ] **Step 8: Test binary file (PDF/DOCX) — Stage 2 fallback**

Upload a .pdf file. Expected: Document created with content='[Uploaded file: ...]' and metadata.needs_parsing=true.

- [ ] **Step 9: Verify Documents page shows uploaded files**

Open web app → Documents page. All uploaded files should appear in the table.
Click a row → DocumentSheet opens with content and metadata.

- [ ] **Step 10: Deploy sync-documents**

```bash
supabase functions deploy sync-documents
```

- [ ] **Step 11: Commit if any fixes were needed**

---

## Task 8: Chrome Extension — ChatGPT Sync

**Goal:** Verify extension installs, authenticates, and syncs ChatGPT conversations.

**Files:**
- Verify: `extension/manifest.json`
- Verify: `extension/popup.html`
- Verify: `extension/popup.js`
- Verify: `extension/background.js`

**Prerequisites:**
- All sync-chatgpt* functions deployed (Task 3)
- A ChatGPT account logged in at chatgpt.com

- [ ] **Step 1: Verify extension Supabase config**

Check `extension/popup.js` — find hardcoded `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
They must match your Supabase project. Update if wrong.

- [ ] **Step 2: Load extension in Chrome**

1. Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. "Load unpacked" → select `extension/` folder
4. Expected: Extension icon appears in toolbar

- [ ] **Step 3: Test login in extension popup**

1. Click extension icon → popup opens
2. Enter email/password (same as web app)
3. Expected: Login succeeds, shows "Sync" button

- [ ] **Step 4: Navigate to chatgpt.com**

Open https://chatgpt.com and ensure you're logged in.

- [ ] **Step 5: Click "Sync" in extension**

1. Click extension icon → click "Sync" button
2. Expected:
   - Progress indicator appears ("Loading conversations...")
   - Conversations are fetched from ChatGPT API
   - Delta check via sync-chatgpt-check
   - New/updated conversations sent via sync-chatgpt
   - Final status: "Synced N conversations"

- [ ] **Step 6: Verify in database**

Supabase Dashboard → documents. Filter by source='chatgpt'.
Expected: ChatGPT conversations appear with titles, content, and metadata.

- [ ] **Step 7: Verify in web app**

Open web app → Dashboard. ChatGPT card should show count > 0 with last sync time.
Documents page → filter by ChatGPT → conversations visible.

- [ ] **Step 8: Test re-sync (incremental)**

Click "Sync" again in extension.
Expected: Only new/changed conversations sync. Already-synced ones are skipped.

- [ ] **Step 9: Commit if any fixes were needed**

---

## Task 9: Deploy All + End-to-End Smoke Test

**Goal:** Deploy remaining functions, verify everything works with production URLs.

**Files:**
- Check: all Edge Functions deployed
- Check: `web/vercel.json`
- Check: extension config points to production Supabase URL

- [ ] **Step 1: Deploy all Edge Functions at once**

```bash
supabase functions deploy
```

Verify all 7 functions deployed:
```bash
supabase functions list
```

Expected: sync-status, sync-chatgpt, sync-chatgpt-check, auth-gmail, sync-gmail, sync-sites, sync-documents.

- [ ] **Step 2: Set production secrets**

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=<value> \
  GOOGLE_CLIENT_SECRET=<value> \
  GOOGLE_REDIRECT_URI=https://<your-app>.vercel.app/auth/gmail/callback
```

- [ ] **Step 3: Verify SearchPage works**

By this point, documents exist in the database from Tasks 3-8. Test the SearchPage:

1. Open web app → Search (sidebar)
2. Type a keyword that exists in synced documents (e.g., a ChatGPT conversation title)
3. Expected: Results appear with highlighted search terms
4. Click source tabs (ChatGPT, Gmail, etc.) — results filter correctly
5. Click a result — DocumentSheet opens with full content

If search returns no results despite data existing, check SearchPage.tsx query logic (ilike on title/content).

- [ ] **Step 4: Lint + typecheck before production build**

```bash
cd web
npm run lint && npx tsc -b --noEmit
```

Expected: No errors. Fix any issues introduced during Tasks 1-8 before building.

- [ ] **Step 5: Production build of web app**

```bash
cd web
npm run build
```

Expected: `dist/` folder created, no errors.

- [ ] **Step 6: Deploy to Vercel (or test locally)**

Option A: `npx vercel --prod` from `web/` directory.
Option B: Push to GitHub → Vercel auto-deploy.

Set env vars in Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 7: End-to-end smoke test checklist**

Run through this checklist on the production URL:

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 1 | Login | Dashboard loads with sidebar | |
| 2 | Dashboard shows source cards | 5 cards with counts | |
| 3 | Sync Sites (add URL first in Settings) | Documents appear | |
| 4 | Upload TXT file | Document appears | |
| 5 | Upload Telegram JSON | Telegram messages appear | |
| 6 | Extension: Login | Shows sync button | |
| 7 | Extension: Sync ChatGPT | Conversations sync | |
| 8 | Gmail: Connect OAuth | Redirect works, tokens stored | |
| 9 | Gmail: Sync | Emails sync with pagination | |
| 10 | Documents page: filter by source | Filters work | |
| 11 | Documents page: search by title | Search works | |
| 12 | Documents page: click row | DocumentSheet opens with content | |
| 13 | Search page: full-text search | Results appear | |

- [ ] **Step 8: Update PROGRESS.md**

Update `docs/PROGRESS.md` to reflect actual completion status for all tasks.

- [ ] **Step 9: Clean up root .png files**

```bash
rm -f *.png
```

Then verify with `ls *.png` — should be empty. These are screenshot artifacts, not project files.

- [ ] **Step 10: Final commit + tag**

```bash
git add -A && git commit -m "feat: stage 1 complete — all functions verified"
git tag v1.0.0
```

---

## Known Bugs to Fix During Verification

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 1 | MD5 not supported in Deno Web Crypto API | `sync-sites/index.ts:~65` | Change to SHA-256 |
| 2 | `web/.env` committed with real keys | `web/.env` | Add to .gitignore, use .env.local (Task 1 Step 5b) |
| 3 | Extension has hardcoded Supabase URL/key | `extension/popup.js` | OK for single user, but document |
| 4 | PROGRESS.md shows 0% | `docs/PROGRESS.md` | Update after each task |

---

## Execution Order

| Task | Depends on | Can parallelize? |
|------|-----------|------------------|
| 1: Build + Smoke | — | No (first) |
| 2: sync-status | 1 | No (second) |
| 3: ChatGPT sync | 2 | Yes, with 4-7 |
| 4: Gmail OAuth | 2 | Yes, with 3,5-7 |
| 5: Gmail Sync | 4 | No (needs OAuth) |
| 6: Sites sync | 2 | Yes, with 3-5,7 |
| 7: Document upload | 2 | Yes, with 3-6 |
| 8: Extension | 3 | No (needs ChatGPT deployed) |
| 9: Deploy all | 1-8 | No (last) |

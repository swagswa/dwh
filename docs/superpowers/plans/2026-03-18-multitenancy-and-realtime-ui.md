# Multi-Tenancy + Real-Time UI Updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate data per user (each user sees only their documents/credentials/sync history) and make UI update counters + lists instantly after sync/upload without page reload.

**Architecture:** Add `user_id` column to all 3 tables, update RLS policies to filter by `auth.uid()`, pass `user.id` from `verifyAuth()` into all edge function writes. On the frontend, use a shared refetch callback that DashboardPage exposes to child components, triggered after any sync/upload completes.

**Tech Stack:** Supabase (PostgreSQL migrations, RLS), Deno Edge Functions, React state lifting

---

## Task 1: Database Migration — Add user_id + Update RLS

**Files:**
- Create: `supabase/migrations/006_multitenancy.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add user_id to all tables
ALTER TABLE documents ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE sync_runs ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE credentials ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Create indexes for user_id filtering
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_sync_runs_user_id ON sync_runs(user_id);
CREATE INDEX idx_credentials_user_id ON credentials(user_id);

-- Update unique constraint: documents unique per user+source+source_id
ALTER TABLE documents DROP CONSTRAINT documents_source_source_id_key;
ALTER TABLE documents ADD CONSTRAINT documents_user_source_source_id_key UNIQUE(user_id, source, source_id);

-- Update credentials PK: per user+source instead of just id
ALTER TABLE credentials DROP CONSTRAINT credentials_pkey;
ALTER TABLE credentials ADD PRIMARY KEY (user_id, id);

-- Drop old RLS policies
DROP POLICY IF EXISTS "authenticated read" ON documents;
DROP POLICY IF EXISTS "Allow authenticated read" ON credentials;
DROP POLICY IF EXISTS "Allow authenticated insert" ON credentials;
DROP POLICY IF EXISTS "Allow authenticated update" ON credentials;
DROP POLICY IF EXISTS "Allow authenticated delete" ON credentials;
DROP POLICY IF EXISTS "Allow authenticated read" ON documents;
DROP POLICY IF EXISTS "Allow authenticated delete" ON documents;

-- New RLS: users see only their own data
CREATE POLICY "users read own documents" ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users delete own documents" ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- sync_runs: users can read their own sync history
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
```

- [ ] **Step 2: Apply migration to remote DB**

Run: `npx supabase db push`
Expected: Migration applies successfully, all tables now have user_id column.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_multitenancy.sql
git commit -m "feat: add user_id to all tables, per-user RLS policies"
```

---

## Task 2: Update verifyAuth to Return user object

**Files:**
- Modify: `supabase/functions/_shared/auth.ts`

The auth helper already returns `{ user, error }`. No changes needed — `user.id` is available. Just confirm edge functions use it.

- [ ] **Step 1: Verify auth.ts returns user.id**

Read `supabase/functions/_shared/auth.ts` — confirm `verifyAuth()` returns `{ user }` where `user.id` is the UUID. It already does:
```typescript
const { data: { user }, error } = await supabase.auth.getUser(token)
return { user, error: null }
```

No code changes needed here.

---

## Task 3: Update sync-documents to Write user_id

**Files:**
- Modify: `supabase/functions/sync-documents/index.ts`

- [ ] **Step 1: Add user_id to all upserts**

In `index.ts`, after `const auth = await verifyAuth(req)`, the `auth.user.id` is available.

Change Telegram upsert (around line 59):
```typescript
await supabase.from('documents').upsert({
  user_id: auth.user!.id,    // ADD THIS
  source: 'telegram',
  ...
}, { onConflict: 'user_id,source,source_id' })  // UPDATE CONFLICT KEY
```

Change sync_runs insert (around line 68):
```typescript
await supabase.from('sync_runs').insert({
  user_id: auth.user!.id,    // ADD THIS
  source: 'telegram',
  ...
})
```

Change generic document upsert (around line 85):
```typescript
await supabase.from('documents').upsert({
  user_id: auth.user!.id,    // ADD THIS
  source: 'documents',
  ...
}, { onConflict: 'user_id,source,source_id' })  // UPDATE CONFLICT KEY
```

Change generic sync_runs insert (around line 94):
```typescript
await supabase.from('sync_runs').insert({
  user_id: auth.user!.id,    // ADD THIS
  source: 'documents',
  ...
})
```

- [ ] **Step 2: Deploy and test**

Run: `npx supabase functions deploy sync-documents --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-documents/index.ts
git commit -m "feat: sync-documents writes user_id to documents and sync_runs"
```

---

## Task 4: Update sync-chatgpt to Write user_id

**Files:**
- Modify: `supabase/functions/sync-chatgpt/index.ts`

- [ ] **Step 1: Add user_id to documents upsert array and sync_runs**

Each document in the upsert array needs `user_id: auth.user!.id`.
The `onConflict` key changes to `'user_id,source,source_id'`.
sync_runs insert gets `user_id: auth.user!.id`.

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy sync-chatgpt --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-chatgpt/index.ts
git commit -m "feat: sync-chatgpt writes user_id"
```

---

## Task 5: Update sync-gmail to Write user_id

**Files:**
- Modify: `supabase/functions/sync-gmail/index.ts`

- [ ] **Step 1: Add user_id to all DB operations**

- credentials read: `.eq('id', 'gmail').eq('user_id', auth.user!.id)`
- documents hash load: `.eq('source', 'gmail').eq('user_id', auth.user!.id)`
- documents upsert: add `user_id: auth.user!.id`, conflict key `'user_id,source,source_id'`
- credentials token refresh upsert: add `user_id: auth.user!.id`
- sync_runs insert: add `user_id: auth.user!.id`

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy sync-gmail --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-gmail/index.ts
git commit -m "feat: sync-gmail writes user_id, reads user-scoped credentials"
```

---

## Task 6: Update sync-sites to Write user_id

**Files:**
- Modify: `supabase/functions/sync-sites/index.ts`

- [ ] **Step 1: Add user_id to all DB operations**

- credentials read: `.eq('id', 'sites').eq('user_id', auth.user!.id)`
- documents hash load: `.eq('source', 'sites').eq('user_id', auth.user!.id)`
- documents upsert: add `user_id: auth.user!.id`, conflict key `'user_id,source,source_id'`
- sync_runs insert: add `user_id: auth.user!.id`

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy sync-sites --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-sites/index.ts
git commit -m "feat: sync-sites writes user_id, reads user-scoped data"
```

---

## Task 7: Update sync-status to Filter by user_id

**Files:**
- Modify: `supabase/functions/sync-status/index.ts`

- [ ] **Step 1: Add user_id filter to queries**

```typescript
// Documents count per source — filter by user
const { data: docs } = await supabase
  .from('documents')
  .select('source')
  .eq('user_id', auth.user!.id)

// Sync runs — filter by user
const { data: runs } = await supabase
  .from('sync_runs')
  .select('*')
  .eq('user_id', auth.user!.id)
  .order('finished_at', { ascending: false })
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy sync-status --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-status/index.ts
git commit -m "feat: sync-status returns user-scoped stats"
```

---

## Task 8: Update auth-gmail to Write user_id to credentials

**Files:**
- Modify: `supabase/functions/auth-gmail/index.ts`

- [ ] **Step 1: Add user_id to credentials upsert**

```typescript
await supabase.from('credentials').upsert({
  user_id: auth.user!.id,    // ADD THIS
  id: 'gmail',
  access_token: tokens.access_token,
  ...
}, { onConflict: 'user_id,id' })  // UPDATE CONFLICT KEY
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy auth-gmail --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/auth-gmail/index.ts
git commit -m "feat: auth-gmail writes user_id to credentials"
```

---

## Task 9: Update sync-chatgpt-check to Filter by user_id

**Files:**
- Modify: `supabase/functions/sync-chatgpt-check/index.ts`

- [ ] **Step 1: Add user_id filter**

The function checks which conversations already exist. Add `.eq('user_id', auth.user!.id)` to the documents query.

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy sync-chatgpt-check --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-chatgpt-check/index.ts
git commit -m "feat: sync-chatgpt-check filters by user_id"
```

---

## Task 10: Update Frontend — SettingsPage credentials operations

**Files:**
- Modify: `web/src/components/SettingsPage.tsx`

- [ ] **Step 1: No changes needed for reads**

Credentials reads go through Supabase JS client with anon key — RLS will automatically filter by `auth.uid() = user_id`. The frontend queries `.eq('id', 'gmail')` and RLS adds the user filter.

However, **frontend writes** (Settings page deletes/upserts credentials directly) need user_id:

For credential deletes (GmailSection disconnect):
```typescript
await supabase.from('credentials').delete().eq('id', 'gmail')
// RLS handles user_id filtering on DELETE — no change needed
```

For sites URL upsert (SitesSection):
```typescript
// Need to add user_id to the upsert
const { data: { user } } = await supabase.auth.getUser()
await supabase.from('credentials').upsert({
  user_id: user!.id,    // ADD THIS
  id: 'sites',
  metadata: { urls },
}, { onConflict: 'user_id,id' })
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/SettingsPage.tsx
git commit -m "feat: SettingsPage writes user_id to credentials"
```

---

## Task 11: Real-Time UI — Instant Counter Updates After Sync/Upload

**Problem:** After sync or file upload, the dashboard counters and document lists don't update. User must reload the page.

**Solution:** Create a shared event system. When any sync/upload completes, emit an event. DashboardPage and DocumentsPage listen and refetch.

**Files:**
- Create: `web/src/lib/events.ts`
- Modify: `web/src/components/DashboardPage.tsx`
- Modify: `web/src/components/GlobalDropZone.tsx`
- Modify: `web/src/components/SettingsPage.tsx`
- Modify: `web/src/components/DocumentsPage.tsx`
- Modify: `web/src/components/SearchPage.tsx`

- [ ] **Step 1: Create simple event emitter**

Create `web/src/lib/events.ts`:
```typescript
type Listener = () => void
const listeners = new Set<Listener>()

export function onDataChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitDataChange() {
  listeners.forEach((fn) => fn())
}
```

- [ ] **Step 2: Emit after sync in DashboardPage**

In `DashboardPage.tsx`, after `handleSync` completes (after `fetchStats()`):
```typescript
import { emitDataChange, onDataChange } from '@/lib/events'

// After sync completes:
await fetchStats()
emitDataChange()
```

Also subscribe to external changes (from GlobalDropZone/SettingsPage):
```typescript
useEffect(() => {
  return onDataChange(() => {
    fetchStats()
  })
}, [])
```

- [ ] **Step 3: Emit after file upload in GlobalDropZone**

In `GlobalDropZone.tsx`, after successful upload:
```typescript
import { emitDataChange } from '@/lib/events'

// After res.ok in uploadFile:
setFiles((prev) => prev.map(...))
emitDataChange()
```

- [ ] **Step 4: Emit after file upload in SettingsPage**

In `SettingsPage.tsx` FileUploadSection, after successful upload:
```typescript
import { emitDataChange } from '@/lib/events'

// After successful upload:
emitDataChange()
```

- [ ] **Step 5: Subscribe in DocumentsPage**

In `DocumentsPage.tsx`:
```typescript
import { onDataChange } from '@/lib/events'

useEffect(() => {
  return onDataChange(() => {
    fetchDocuments()
  })
}, [])
```

- [ ] **Step 6: Subscribe in SearchPage**

In `SearchPage.tsx`:
```typescript
import { onDataChange } from '@/lib/events'

useEffect(() => {
  return onDataChange(() => {
    // Re-run current search if there's an active query
    if (searchText) fetchResults()
  })
}, [searchText])
```

- [ ] **Step 7: Build and test**

Run: `cd web && npm run build`
Expected: Build passes, no TS errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/events.ts web/src/components/DashboardPage.tsx web/src/components/GlobalDropZone.tsx web/src/components/SettingsPage.tsx web/src/components/DocumentsPage.tsx web/src/components/SearchPage.tsx
git commit -m "feat: real-time UI updates — counters and lists refresh after sync/upload"
```

---

## Task 12: Deploy All Edge Functions + Final Verification

- [ ] **Step 1: Deploy all functions**

```bash
npx supabase functions deploy sync-documents --no-verify-jwt
npx supabase functions deploy sync-chatgpt --no-verify-jwt
npx supabase functions deploy sync-gmail --no-verify-jwt
npx supabase functions deploy sync-sites --no-verify-jwt
npx supabase functions deploy sync-status --no-verify-jwt
npx supabase functions deploy auth-gmail --no-verify-jwt
npx supabase functions deploy sync-chatgpt-check --no-verify-jwt
```

- [ ] **Step 2: Build frontend**

```bash
cd web && npm run build
```

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

- [ ] **Step 4: Verify on Vercel**

Check that Vercel build passes at the deployment URL.

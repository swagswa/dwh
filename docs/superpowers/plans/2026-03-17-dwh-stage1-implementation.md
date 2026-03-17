# DWH Stage 1 — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Экспорт данных из 5 источников в Supabase + UI для просмотра. Без embeddings, без поиска, без RAG — это Stage 2.

**Architecture:** Supabase (DB + Auth + Storage + Edge Functions) + Vercel (React UI) + Chrome Extension. Два сервиса.

**Tech Stack:** Supabase Edge Functions (Deno), Vite + React 19 + TypeScript + Tailwind + shadcn/ui, Chrome Extension Manifest V3.

**Spec:** `docs/specs/2026-03-17-dwh-stage1-design.md`

---

## File Structure

```
dwh/
  .gitignore
  package.json                        # root workspace (web, shared)
  tsconfig.base.json
  shared/
    types.ts                          # Document, SyncRun, Credential, Source
  supabase/
    migrations/
      001_initial.sql                 # documents, sync_runs, credentials + RLS + Storage policy
    functions/
      _shared/
        cors.ts                       # CORS headers helper
        auth.ts                       # JWT verification helper
        supabase.ts                   # service_role client
      sync-status/index.ts            # GET — counts + last sync per source
      sync-chatgpt-check/index.ts     # POST — compare update_times, return needed IDs
      sync-chatgpt/index.ts           # POST — receive batch of conversations (10-20), upsert
      sync-gmail/index.ts             # POST — batch Gmail sync with cursor (direct fetch, no googleapis)
      auth-gmail/index.ts             # POST — OAuth callback, GET — OAuth URL
      sync-sites/index.ts             # POST — fetch + parse sites (cheerio + turndown)
      sync-documents/index.ts         # POST — parse uploaded files
  web/
    vercel.json                       # SPA rewrite for OAuth callback
    src/
      App.tsx                         # Auth wrapper + Gmail OAuth callback
      lib/
        supabase.ts                   # Supabase client (anon key)
        api.ts                        # Edge Functions fetch wrapper
      components/
        LoginPage.tsx
        Dashboard.tsx
        SourceCard.tsx
        DocumentsTable.tsx
        DocumentModal.tsx
        SettingsPanel.tsx
        FileUpload.tsx
  extension/
    manifest.json
    popup.html
    popup.js                          # Supabase Auth + sync logic (runs in popup, not SW)
    background.js                     # Minimal: only ChatGPT token extraction
```

---

## Task 1: Scaffolding + Supabase

**Цель:** git init, миграция БД, Storage bucket + policy, shared types, конфиги.

**Уже есть:** package.json, tsconfig.base.json, web/ (Vite scaffold), shared/types.ts.

- [ ] **Step 1: git init + .gitignore**

```gitignore
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

```bash
git init
```

- [ ] **Step 2: Обновить .env.example**

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/gmail/callback
```

- [ ] **Step 3: SQL миграция** (`supabase/migrations/001_initial.sql`)

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

-- Storage policy: authenticated users can upload files
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
create policy "authenticated upload" on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
create policy "authenticated read" on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');
```

- [ ] **Step 4: shared/types.ts** (убрать DocumentChunk если есть)

```typescript
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
```

- [ ] **Step 5: Убрать server из workspaces в package.json**

Workspaces: `["web", "shared"]`.

- [ ] **Step 6: Применить миграцию в Supabase Dashboard**

SQL Editor → вставить → Run. Storage bucket и policy создадутся автоматически из SQL.

- [ ] **Step 7: Создать пользователя**

Dashboard → Authentication → Create user → email/password для клиента.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: scaffolding, migration, shared types"
```

---

## Task 2: Edge Functions — Base + Sync Status

**Цель:** Shared helpers + sync-status. Используем `Deno.serve()` (актуальный API).

- [ ] **Step 1: _shared/cors.ts**

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function corsResponse() {
  return new Response('ok', { headers: corsHeaders })
}
```

- [ ] **Step 2: _shared/supabase.ts**

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2'

export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export function getAnonClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
}
```

- [ ] **Step 3: _shared/auth.ts**

```typescript
import { getAnonClient } from './supabase.ts'

export async function verifyAuth(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing authorization' }
  }
  const token = authHeader.slice(7)
  const supabase = getAnonClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { user: null, error: 'Invalid token' }
  }
  return { user, error: null }
}
```

- [ ] **Step 4: sync-status/index.ts**

```typescript
import { corsHeaders, corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = getServiceClient()

  const { data: docs } = await supabase.from('documents').select('source')
  const counts: Record<string, number> = {}
  for (const doc of docs || []) {
    counts[doc.source] = (counts[doc.source] || 0) + 1
  }

  const { data: runs } = await supabase
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })

  const allSources = ['chatgpt', 'gmail', 'telegram', 'sites', 'documents']
  const stats: Record<string, { count: number; lastSync: unknown }> = {}
  for (const source of allSources) {
    stats[source] = {
      count: counts[source] || 0,
      lastSync: runs?.find(r => r.source === source) ?? null,
    }
  }

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 5: Deploy и проверить**

```bash
supabase functions deploy sync-status
curl -H "Authorization: Bearer <jwt>" https://<project>.supabase.co/functions/v1/sync-status
```

- [ ] **Step 6: Commit**

---

## Task 3: Edge Functions — ChatGPT sync

**Цель:** Два endpoint: check (какие чаты нужно обновить) + sync (принять порцию чатов).

Extension flow:
1. Загрузить список чатов из ChatGPT (id + update_time)
2. POST sync-chatgpt-check { items: [{id, update_time}] } → получить { needed_ids: [...] }
3. Загрузить только нужные чаты (с задержкой 2-3 сек)
4. Отправить порциями по 10: POST sync-chatgpt { conversations: [...10 items...] }
5. Повторить пока не отправлены все

- [ ] **Step 1: sync-chatgpt-check/index.ts**

```typescript
import { corsHeaders, corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()
  const auth = await verifyAuth(req)
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = getServiceClient()
  const { items } = await req.json()
  // items = [{ id: "conv-id", update_time: 1234567890 }, ...]

  // Load existing documents' source_id + updated_at
  const { data: existing } = await supabase
    .from('documents')
    .select('source_id, updated_at')
    .eq('source', 'chatgpt')

  const existingMap = new Map(
    existing?.map(d => [d.source_id, new Date(d.updated_at).getTime() / 1000]) ?? []
  )

  // Compare: need sync if not exists or update_time is newer
  const needed_ids = items
    .filter((item: any) => {
      const stored = existingMap.get(item.id)
      return !stored || item.update_time > stored
    })
    .map((item: any) => item.id)

  return new Response(JSON.stringify({ needed_ids, total: items.length, needed: needed_ids.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: sync-chatgpt/index.ts**

Принимает batch (10-20 чатов), парсит, upsert.

```typescript
import { corsHeaders, corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()
  const auth = await verifyAuth(req)
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = getServiceClient()
  const { conversations } = await req.json()

  if (!Array.isArray(conversations) || conversations.length > 25) {
    return new Response(JSON.stringify({ error: 'conversations: array of max 25 items' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const toUpsert: any[] = []

  for (const conv of conversations) {
    const messages = Object.values(conv.mapping || {})
      .filter((n: any) => n.message?.content?.parts?.length)
      .map((n: any) => ({
        role: n.message.author.role,
        content: n.message.content.parts.join('\n'),
      }))

    const content = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n')
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('MD5', encoder.encode(content))
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    toUpsert.push({
      source: 'chatgpt',
      source_id: conv.id,
      title: conv.title,
      content,
      content_hash: contentHash,
      metadata: { chat_id: conv.id, message_count: messages.length, messages },
      updated_at: new Date().toISOString(),
    })
  }

  if (toUpsert.length) {
    const { error } = await supabase.from('documents').upsert(toUpsert, { onConflict: 'source,source_id' })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ synced: toUpsert.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 3: Deploy + test**
- [ ] **Step 4: Commit**

---

## Task 4: Edge Functions — Gmail OAuth + Sync

**Цель:** OAuth2 + батчевая синхронизация. Прямые fetch к Gmail REST API (без googleapis SDK — легче, работает в Deno гарантированно).

- [ ] **Step 1: auth-gmail/index.ts**

```typescript
// GET → return OAuth URL
// POST { code } → exchange for tokens via https://oauth2.googleapis.com/token, save to credentials

// Token exchange:
// POST https://oauth2.googleapis.com/token
// { code, client_id, client_secret, redirect_uri, grant_type: 'authorization_code' }

// Token refresh (used in sync-gmail):
// POST https://oauth2.googleapis.com/token
// { refresh_token, client_id, client_secret, grant_type: 'refresh_token' }
```

- [ ] **Step 2: sync-gmail/index.ts**

Batch/cursor pattern. Каждый вызов = 1 страница (50 писем). Прямые fetch к Gmail API.

```typescript
// POST { cursor?: string }

// 1. Get credentials from DB, auto-refresh token if expired
// 2. GET https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&pageToken={cursor}
// 3. For each message: GET .../messages/{id}?format=full
// 4. Parse headers (subject, from, to, date) + body (base64 decode)
// 5. content_hash check → batch upsert changed
// 6. Create/update sync_run
// 7. Return { synced, skipped, cursor: nextPageToken, done: !nextPageToken }
```

UI loop:
```
POST sync-gmail → { synced: 50, cursor: "abc", done: false }
POST sync-gmail { cursor: "abc" } → { synced: 98, cursor: "def", done: false }
...
POST sync-gmail { cursor: "xyz" } → { synced: 5000, done: true }
```

- [ ] **Step 3: Deploy + test**
- [ ] **Step 4: Commit**

---

## Task 5: Edge Functions — Sites + Documents sync

**Цель:** Парсинг сайтов (cheerio + turndown) + парсинг загруженных файлов.

- [ ] **Step 1: sync-sites/index.ts**

```typescript
// POST { urls?: string[] }
// If no urls → read from credentials (id='sites', metadata.urls)
// For each URL:
//   1. fetch(url) → HTML
//   2. cheerio.load(html) → extract text from main/article/body
//   3. turndown → convert to Markdown
//   4. content_hash → upsert if changed
```

Зависимости: `npm:cheerio`, `npm:turndown` (оба pure JS, работают в Deno).

- [ ] **Step 2: sync-documents/index.ts**

```typescript
// POST { file_path, filename }
// 1. Download from Supabase Storage
// 2. Detect format by extension
// 3. Parse:
//    .json → Telegram export (JSON.parse, extract messages as source='telegram')
//    .txt/.md → plain text
//    .pdf → попробовать npm:pdf-parse (fallback: save reference only)
//    .docx → npm:mammoth (pure JS, works in Deno)
//    .xlsx → npm:read-excel-file (lightweight)
// 4. Upsert to documents
```

Telegram JSON export формат:
```json
{ "name": "Channel Name", "messages": [{ "id": 1, "text": "...", "date": "2026-01-15T10:30:00" }] }
```

Каждое сообщение → отдельный document (source='telegram', source_id=message_id).

**Fallback:** если PDF/DOCX парсинг сломается в Deno — сохраняем document с content = filename + "uploaded, parsing pending", metadata = { file_path }. Парсинг доделаем в Stage 2 или локально.

- [ ] **Step 3: Deploy + test**
- [ ] **Step 4: Commit**

---

## Task 6: Chrome Extension

**Цель:** Manifest V3, Supabase Auth в popup, ChatGPT sync с порционной отправкой.

**Ключевое:** Sync логика в popup.js (не в service worker) — popup открыт = sync работает. Прогресс сохраняется в chrome.storage.

- [ ] **Step 1: manifest.json**

```json
{
  "manifest_version": 3,
  "name": "DWH ChatGPT Sync",
  "version": "1.0",
  "permissions": ["storage", "cookies"],
  "host_permissions": ["https://chatgpt.com/*"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" }
}
```

- [ ] **Step 2: popup.html + popup.js**

```html
<!-- popup.html -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="popup.js"></script>
```

popup.js flow:
1. Init Supabase client с hardcoded URL + anon key
2. Check session → show login form or sync UI
3. Login: `supabase.auth.signInWithPassword()`
4. Sync button click:
   a. Get ChatGPT token via background.js message
   b. Load conversation list (paginated, limit=28)
   c. POST sync-chatgpt-check → get needed_ids
   d. If 0 needed → "Всё актуально!"
   e. For each needed ID (with 2-3 sec delay):
      - GET /backend-api/conversation/{id}
      - Collect in batch of 10
      - POST sync-chatgpt { conversations: batch }
      - Update progress: "15 / 47 чатов"
      - Save progress to chrome.storage (resume if popup reopened)
   f. Done → "Синхронизировано 47 чатов"

- [ ] **Step 3: background.js — минимальный, только token extraction**

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getChatGPTToken') {
    fetch('https://chatgpt.com/api/auth/session')
      .then(r => r.json())
      .then(data => sendResponse({ token: data.accessToken }))
      .catch(err => sendResponse({ error: err.message }))
    return true // async response
  }
})
```

- [ ] **Step 4: Тестирование в Chrome**
- [ ] **Step 5: Commit**

---

## Task 7: Web UI

**Цель:** Красивый UI: login, dashboard, таблица, настройки, upload.

**Web уже scaffolded** (Vite + React + TS + Tailwind). Добавить shadcn/ui и компоненты.

- [ ] **Step 1: Setup**

```bash
cd web
npm install @supabase/supabase-js
npx shadcn@latest init
npx shadcn@latest add button card input table dialog badge tabs separator scroll-area
```

Создать `web/vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: lib/supabase.ts + lib/api.ts**

```typescript
// supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// api.ts
import { supabase } from './supabase'
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export async function edgeFetch(fn: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(`${FUNCTIONS_URL}/${fn}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options?.headers,
    },
  })
}
```

- [ ] **Step 3: App.tsx**

- Auth state listener → LoginPage or Dashboard
- Gmail OAuth callback handler: detect `?code=` → POST auth-gmail → redirect to `/`

- [ ] **Step 4: LoginPage.tsx**

Email + password, `supabase.auth.signInWithPassword()`. Clean design.

- [ ] **Step 5: Dashboard.tsx + SourceCard.tsx**

- 5 карточек: ChatGPT, Gmail, Telegram, Sites, Documents
- Fetch stats from `edgeFetch('sync-status')`
- Sync buttons:
  - ChatGPT → badge "Через расширение"
  - Gmail → cursor loop: `edgeFetch('sync-gmail', POST)` repeated until done
  - Sites → `edgeFetch('sync-sites', POST)`
  - Telegram → badge "Загрузите JSON экспорт"
  - Documents → open FileUpload
- Progress indicator on cards during sync
- Auto-refresh every 10 sec

- [ ] **Step 6: DocumentsTable.tsx + DocumentModal.tsx**

- `supabase.from('documents').select('*').order('updated_at', { ascending: false })`
- Filter by source (dropdown)
- Text search (ilike on title)
- Pagination (50 per page)
- Click row → DocumentModal with full content + collapsible metadata

- [ ] **Step 7: SettingsPanel.tsx + FileUpload.tsx**

- **Gmail:** "Подключить Gmail" → `edgeFetch('auth-gmail')` GET → redirect to Google OAuth
- **Sites:** URL list editor → save to credentials via Edge Function or direct Supabase
- **FileUpload:** drag & drop → `supabase.storage.from('documents').upload()` → `edgeFetch('sync-documents', POST)`

- [ ] **Step 8: Commit**

---

## Task 8: Deploy

**Цель:** Два сервиса: Supabase (functions) + Vercel (UI). Расширение как ZIP.

- [ ] **Step 1: Deploy Edge Functions**

```bash
supabase functions deploy
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REDIRECT_URI=https://your-app.vercel.app/auth/gmail/callback
```

- [ ] **Step 2: Deploy Web UI на Vercel**

1. GitHub repo → Vercel
2. Root directory: `web`
3. Framework: Vite
4. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

- [ ] **Step 3: Google OAuth redirect URI**

Google Cloud Console → add production callback URL.

- [ ] **Step 4: Упаковать расширение**

Update SUPABASE_URL + ANON_KEY in popup.js → `zip -r extension.zip extension/`

- [ ] **Step 5: Smoke test**

1. UI → login ✓
2. Gmail → connect → sync (cursor loop) ✓
3. Extension → login → sync ChatGPT ✓
4. Upload PDF → check in table ✓
5. Upload Telegram JSON → check in table ✓
6. Sync sites → check in table ✓

- [ ] **Step 6: Commit + tag v1.0**

---

## Порядок выполнения

| # | Task | Зависит от |
|---|------|-----------|
| 1 | Scaffolding + Supabase | — |
| 2 | Edge Functions base + sync-status | 1 |
| 3 | ChatGPT sync (check + sync) | 2 |
| 4 | Gmail OAuth + sync | 2 |
| 5 | Sites + Documents sync | 2 |
| 6 | Chrome Extension | 3 |
| 7 | Web UI | 2 |
| 8 | Deploy | All |

**Параллельно:**
- Tasks 3, 4, 5 (Edge Functions)
- Task 6 (Extension) + Task 7 (UI)

# ChatGPT Projects (Folders) Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync ChatGPT conversations from Projects/folders and allow filtering by project name in the UI.

**Architecture:** Chrome extension fetches project list from `/backend-api/gizmos/snorlax/sidebar`, then conversations per project via `/backend-api/gizmos/{id}/conversations`. Each conversation gets `project_name` in metadata. Edge function stores it. Frontend adds a project filter dropdown when viewing ChatGPT source.

**Tech Stack:** Chrome Extension (vanilla JS), Supabase Edge Functions (Deno), React + Tailwind (frontend)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `extension/popup.js` | Modify | Add project fetching before conversation list |
| `supabase/functions/sync-chatgpt/index.ts` | Modify | Store `project_name` + `project_id` in metadata |
| `web/src/components/DocumentsPage.tsx` | Modify | Add project filter dropdown for ChatGPT tab |
| `web/src/components/SearchPage.tsx` | Modify | Add project filter dropdown for ChatGPT tab |

---

### Task 1: Extension — Fetch Projects + Their Conversations

**Files:**
- Modify: `extension/popup.js` (lines 200-227, the "FRESH sync" block)

- [ ] **Step 1: Add `fetchProjects()` helper after `getChatGPTToken()` helper (line ~351)**

```javascript
async function fetchProjects(token) {
  const projects = []
  let cursor = null
  while (true) {
    const url = 'https://chatgpt.com/backend-api/gizmos/snorlax/sidebar' + (cursor ? `?cursor=${cursor}` : '')
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break // Projects not available (free tier) — skip silently
    const data = await res.json()
    const items = data.items || []
    for (const item of items) {
      if (item.gizmo?.id) {
        projects.push({
          id: item.gizmo.id,
          name: item.gizmo.display?.name || 'Unnamed Project',
        })
      }
    }
    cursor = data.cursor
    if (!cursor) break
  }
  return projects
}

async function fetchProjectConversations(token, project) {
  const convs = []
  let cursor = '0'
  while (cursor !== null) {
    const url = `https://chatgpt.com/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json()
    const items = data.items || []
    for (const item of items) {
      item._project_name = project.name
      item._project_id = project.id
      convs.push(item)
    }
    cursor = data.cursor ?? null
    if (cursor === undefined || cursor === null) break
    await delay(500)
  }
  return convs
}
```

- [ ] **Step 2: Insert project fetching into the FRESH sync block (after line 201, before line 203)**

Replace lines 203-227 (the conversation loading block) with:

```javascript
      // Load projects first
      setStatus('Загружаю проекты...')
      const projects = await fetchProjects(chatgptToken)
      if (projects.length > 0) {
        setStatus(`Найдено ${projects.length} проектов, загружаю чаты...`)
      }

      // Fetch conversations from all projects
      const allConvs = []
      for (const project of projects) {
        setStatus(`Проект "${project.name}": загружаю чаты...`)
        const projectConvs = await fetchProjectConversations(chatgptToken, project)
        allConvs.push(...projectConvs)
        setStatus(`Проект "${project.name}": ${projectConvs.length} чатов`)
        await delay(500)
      }

      // Load regular (non-project) conversations
      setStatus('Загружаю обычные чаты...')
      let offset = 0
      while (true) {
        const res = await fetch(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=28`, {
          headers: { Authorization: `Bearer ${chatgptToken}` },
        })
        if (!res.ok) throw new Error(`ChatGPT API error: ${res.status}`)
        const data = await res.json()
        const items = data.items || []
        allConvs.push(...items)
        setStatus(`Загружено: ${allConvs.length} чатов...`)

        const limit = parseInt(chatLimitInput.value) || parseInt(chatLimitSlider.value) || 500
        if (items.length < 28) break
        if (allConvs.length >= limit) {
          allConvs.splice(limit)
          break
        }
        offset += 28
        await delay(1000)
      }
```

- [ ] **Step 3: Pass project info when sending conversations to sync-chatgpt**

In the sync batch sending block (around line 304), the `batch` array contains raw conversation objects. The `_project_name` and `_project_id` fields are already on each conv object from step 1, so they will be sent as part of the JSON body. No change needed here — the edge function will read them.

- [ ] **Step 4: Commit**

```bash
git add extension/popup.js
git commit -m "feat: extension fetches ChatGPT project conversations"
```

---

### Task 2: Edge Function — Store project_name in Metadata

**Files:**
- Modify: `supabase/functions/sync-chatgpt/index.ts`

- [ ] **Step 1: Extract project info from conversation object**

In the `for (const conv of conversations)` loop, after `const convId = ...` (around line 24), add:

```typescript
    const projectName = conv._project_name || null
    const projectId = conv._project_id || conv.gizmo_id || null
```

- [ ] **Step 2: Add to metadata object**

In the `toUpsert.push({...})` block, update the metadata field:

```typescript
    toUpsert.push({
      user_id: auth.user!.id,
      source: 'chatgpt',
      source_id: convId,
      title: conv.title || 'Untitled',
      content,
      content_hash: contentHash,
      metadata: {
        chat_id: convId,
        message_count: messages.length,
        messages,
        project_name: projectName,
        project_id: projectId,
      },
      updated_at: new Date().toISOString(),
    })
```

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy sync-chatgpt --no-verify-jwt
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/sync-chatgpt/index.ts
git commit -m "feat: sync-chatgpt stores project_name in metadata"
```

---

### Task 3: Frontend — Project Filter on DocumentsPage

**Files:**
- Modify: `web/src/components/DocumentsPage.tsx`

- [ ] **Step 1: Add project state and fetch unique project names**

After existing state declarations (around line 109), add:

```typescript
const [projects, setProjects] = useState<string[]>([])
const [activeProject, setActiveProject] = useState<string>('all')
```

Add a `useEffect` to fetch unique project names when ChatGPT tab is active:

```typescript
useEffect(() => {
  if (activeTab !== 'chatgpt') {
    setProjects([])
    setActiveProject('all')
    return
  }
  const fetchProjects = async () => {
    const { data } = await supabase
      .from('documents')
      .select('metadata')
      .eq('source', 'chatgpt')
      .not('metadata->project_name', 'is', null)
    const names = [...new Set(
      (data || [])
        .map((d: any) => d.metadata?.project_name)
        .filter(Boolean)
    )].sort()
    setProjects(names)
  }
  fetchProjects()
}, [activeTab])
```

- [ ] **Step 2: Add project filter to the Supabase query**

In `fetchDocuments()`, after the `query = query.eq('source', activeTab)` line, add:

```typescript
      if (activeTab === 'chatgpt' && activeProject !== 'all') {
        query = query.eq('metadata->>project_name', activeProject)
      }
```

Add `activeProject` to the dependency arrays of both `useEffect`s that call `fetchDocuments()`.

- [ ] **Step 3: Reset page when project changes**

```typescript
useEffect(() => {
  setPage(1)
}, [activeProject])
```

- [ ] **Step 4: Render project filter dropdown**

After the source tabs and before the documents table, when `activeTab === 'chatgpt'` and `projects.length > 0`, render:

```tsx
{activeTab === 'chatgpt' && projects.length > 0 && (
  <select
    value={activeProject}
    onChange={(e) => setActiveProject(e.target.value)}
    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none"
  >
    <option value="all">Все проекты</option>
    {projects.map((p) => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
)}
```

Place this in the filter bar area, next to the search input.

- [ ] **Step 5: Build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/DocumentsPage.tsx
git commit -m "feat: DocumentsPage project filter for ChatGPT"
```

---

### Task 4: Frontend — Project Filter on SearchPage

**Files:**
- Modify: `web/src/components/SearchPage.tsx`

- [ ] **Step 1: Add project state and fetch (same pattern as DocumentsPage)**

```typescript
const [projects, setProjects] = useState<string[]>([])
const [activeProject, setActiveProject] = useState<string>('all')
```

Same `useEffect` to fetch projects when `activeTab === 'chatgpt'`.

- [ ] **Step 2: Add project filter to search query**

In `fetchResults()`, after the source filter, add:

```typescript
    if (activeTab === 'chatgpt' && activeProject !== 'all') {
      query = query.eq('metadata->>project_name', activeProject)
    }
```

Add `activeProject` to dependency arrays.

- [ ] **Step 3: Render project dropdown (same select element)**

Place after source tabs, same pattern as DocumentsPage.

- [ ] **Step 4: Build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SearchPage.tsx
git commit -m "feat: SearchPage project filter for ChatGPT"
```

---

### Task 5: Show Project Badge in Document Lists

**Files:**
- Modify: `web/src/components/DocumentsPage.tsx`
- Modify: `web/src/components/DocumentSheet.tsx`

- [ ] **Step 1: Show project name badge in document row**

In DocumentsPage, in the document row rendering, after the source badge, if the doc has `metadata.project_name`, show it:

```tsx
{doc.source === 'chatgpt' && (doc.metadata as any)?.project_name && (
  <span className="ml-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
    {(doc.metadata as any).project_name}
  </span>
)}
```

- [ ] **Step 2: Show project name in DocumentSheet header**

In DocumentSheet, after the SourceBadge in the header, add:

```tsx
{doc.source === 'chatgpt' && (doc.metadata as Record<string, unknown>)?.project_name && (
  <span className="ml-2 rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
    {(doc.metadata as Record<string, unknown>).project_name as string}
  </span>
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/DocumentsPage.tsx web/src/components/DocumentSheet.tsx
git commit -m "feat: show project name badge on ChatGPT documents"
```

---

### Task 6: Deploy + Push

- [ ] **Step 1: Deploy edge function**

```bash
npx supabase functions deploy sync-chatgpt --no-verify-jwt
```

- [ ] **Step 2: Push all commits**

```bash
git push
```

- [ ] **Step 3: Verify Vercel build passes**

Check deployment at Vercel dashboard.

# Client-Side File Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse all uploaded file types (PDF, DOCX, XLSX, TXT, MD, CSV, JSON) in the browser and send extracted text to the Edge Function, so documents are fully searchable and viewable.

**Architecture:** Client-side parsing using `pdfjs-dist` (PDF), `mammoth` (DOCX), `xlsx`/SheetJS (XLSX). A new `web/src/lib/file-parser.ts` module handles all extraction logic. The Edge Function `sync-documents` is simplified to always receive `{ text, filename }` — no more downloading from Storage. Storage upload is removed; text goes directly to the Edge Function.

**Tech Stack:** pdfjs-dist, mammoth, xlsx (SheetJS), existing Vite + React + TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `web/src/lib/file-parser.ts` | Create | Extract text from File objects (PDF, DOCX, XLSX, text) |
| `web/src/components/SettingsPage.tsx` | Modify (lines 234-267) | Use file-parser instead of Storage upload, send text to Edge Function |
| `supabase/functions/sync-documents/index.ts` | Modify (all) | Accept `{ text, filename }` body, no more Storage download |
| `web/src/components/DocumentSheet.tsx` | Modify (lines 180-185) | Better display for document-source files (format info, file icon) |

## Key Decisions

- **No more Storage upload for documents.** Text is extracted client-side and sent directly to the Edge Function. Simpler flow, fewer moving parts, no Storage bucket dependency.
- **PDF worker:** `pdfjs-dist` needs a worker file. Vite handles this via `?url` import for the worker entry point.
- **XLSX:** Sheets are converted to CSV-like text (tab-separated, sheets separated by headers). This makes them searchable.
- **File size guard:** Max 20MB per file client-side. PDF.js and mammoth can handle this comfortably in browser.

---

### Task 1: Install parsing libraries

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install pdfjs-dist, mammoth, xlsx**

```bash
cd web && npm install pdfjs-dist mammoth xlsx
```

- [ ] **Step 2: Verify installation**

```bash
cd web && node -e "require('pdfjs-dist'); require('mammoth'); require('xlsx'); console.log('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat: add pdfjs-dist, mammoth, xlsx for client-side file parsing"
```

---

### Task 2: Create file-parser module

**Files:**
- Create: `web/src/lib/file-parser.ts`

- [ ] **Step 1: Create the parser module**

```typescript
// web/src/lib/file-parser.ts
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export interface ParseResult {
  text: string
  format: string
  pageCount?: number
}

export async function parseFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (макс. 20MB)`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  switch (ext) {
    case 'pdf':
      return parsePdf(file)
    case 'docx':
      return parseDocx(file)
    case 'xlsx':
      return parseXlsx(file)
    case 'json':
      return parseText(file, 'json')
    case 'txt':
    case 'md':
    case 'csv':
      return parseText(file, ext)
    default:
      throw new Error(`Неподдерживаемый формат: .${ext}`)
  }
}

async function parsePdf(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: { str?: string }) => item.str ?? '')
      .join(' ')
    pages.push(text)
  }

  return {
    text: pages.join('\n\n'),
    format: 'pdf',
    pageCount: pdf.numPages,
  }
}

async function parseDocx(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return { text: result.value, format: 'docx' }
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const parts: string[] = []

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    parts.push(`--- ${name} ---\n${csv}`)
  }

  return { text: parts.join('\n\n'), format: 'xlsx' }
}

async function parseText(file: File, format: string): Promise<ParseResult> {
  const text = await file.text()
  return { text, format }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web && npx tsc --noEmit src/lib/file-parser.ts 2>&1 || true
```

Note: There may be type issues with pdfjs-dist worker import — fix them if needed (add `declare module` for `?url` imports if Vite types aren't picked up).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/file-parser.ts
git commit -m "feat: add file-parser module for client-side PDF/DOCX/XLSX extraction"
```

---

### Task 3: Update SettingsPage upload flow

**Files:**
- Modify: `web/src/components/SettingsPage.tsx` (lines 234-267, uploadFile function)

- [ ] **Step 1: Replace uploadFile to use client-side parsing**

Change the `uploadFile` function to:
1. Call `parseFile(file)` to extract text
2. Send `{ text, filename }` to `sync-documents` Edge Function
3. Remove Supabase Storage upload entirely

The new `uploadFile`:

```typescript
import { parseFile } from '@/lib/file-parser'

// Inside FileUploadSection component, replace uploadFile:
const uploadFile = async (file: File) => {
  const entry: UploadedFile = { name: file.name, status: 'uploading' }
  setFiles((prev) => [...prev, entry])

  try {
    const parsed = await parseFile(file)

    const res = await edgeFetch('sync-documents', {
      method: 'POST',
      body: JSON.stringify({
        text: parsed.text,
        filename: file.name,
        format: parsed.format,
        pageCount: parsed.pageCount,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Ошибка обработки: ${res.status}`)
    }

    setFiles((prev) =>
      prev.map((f) => (f.name === file.name ? { ...f, status: 'success' as const } : f)),
    )
  } catch (err) {
    setFiles((prev) =>
      prev.map((f) =>
        f.name === file.name
          ? { ...f, status: 'error' as const, error: String(err) }
          : f,
      ),
    )
  }
}
```

Also remove the `supabase` import if no longer used in this component (it's used in other sections, so likely stays).

- [ ] **Step 2: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SettingsPage.tsx
git commit -m "feat: use client-side parsing in file upload, remove Storage dependency"
```

---

### Task 4: Simplify sync-documents Edge Function

**Files:**
- Modify: `supabase/functions/sync-documents/index.ts` (full rewrite)

- [ ] **Step 1: Rewrite to accept text directly**

The Edge Function no longer downloads from Storage. It receives `{ text, filename, format, pageCount }` and upserts into the `documents` table.

```typescript
import { corsResponse } from '../_shared/cors.ts'
import { verifyAuth } from '../_shared/auth.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { jsonResponse, errorResponse } from '../_shared/response.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()

  const auth = await verifyAuth(req)
  if (auth.error) return errorResponse(auth.error, 401)

  const supabase = getServiceClient()
  const { text, filename, format, pageCount } = await req.json()

  if (!text || !filename) return errorResponse('text and filename required')

  const ext = filename.split('.').pop()?.toLowerCase() || ''

  // Telegram JSON detection
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text)
      if (parsed.messages && Array.isArray(parsed.messages)) {
        const channelName = parsed.name || 'Unknown Channel'
        const toUpsert: any[] = []

        for (const msg of parsed.messages) {
          if (!msg.text || typeof msg.text !== 'string' || !msg.text.trim()) continue
          toUpsert.push({
            source: 'telegram',
            source_id: `${channelName}_${msg.id}`,
            title: `${channelName} #${msg.id}`,
            content: msg.text,
            metadata: { channel: channelName, message_id: msg.id, date: msg.date },
            updated_at: new Date().toISOString(),
          })
        }

        if (toUpsert.length) {
          await supabase.from('documents').upsert(toUpsert, { onConflict: 'source,source_id' })
        }

        await supabase.from('sync_runs').insert({
          source: 'telegram',
          status: 'completed',
          finished_at: new Date().toISOString(),
          items_synced: toUpsert.length,
        })

        return jsonResponse({ synced: toUpsert.length, format: 'telegram_json' })
      }
    } catch {
      // Not valid JSON or not Telegram — fall through to generic document
    }
  }

  // Generic document — all formats
  const sourceId = `${Date.now()}-${filename}`

  await supabase.from('documents').upsert({
    source: 'documents',
    source_id: sourceId,
    title: filename,
    content: text,
    metadata: { filename, format: format || ext, pageCount },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })

  await supabase.from('sync_runs').insert({
    source: 'documents',
    status: 'completed',
    finished_at: new Date().toISOString(),
    items_synced: 1,
  })

  return jsonResponse({ synced: 1, format: format || ext })
})
```

- [ ] **Step 2: Deploy and test**

```bash
supabase functions deploy sync-documents
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-documents/index.ts
git commit -m "feat: sync-documents accepts parsed text directly, remove Storage dependency"
```

---

### Task 5: Improve DocumentSheet display for uploaded files

**Files:**
- Modify: `web/src/components/DocumentSheet.tsx` (lines 176-199, content section)

- [ ] **Step 1: Add format-aware header for document-source files**

In the content section, before rendering content, add file metadata display for `source === 'documents'`:

```typescript
{/* File info bar for uploaded documents */}
{doc.source === 'documents' && doc.metadata && (
  <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-800/50 px-4 py-2.5 text-xs text-slate-400">
    <FileText className="h-4 w-4 text-violet-400" />
    <span className="font-medium text-slate-300">
      {(doc.metadata as Record<string, unknown>).filename as string || doc.title}
    </span>
    {(doc.metadata as Record<string, unknown>).format && (
      <span className="rounded bg-violet-500/10 px-2 py-0.5 text-violet-400 uppercase">
        {(doc.metadata as Record<string, unknown>).format as string}
      </span>
    )}
    {(doc.metadata as Record<string, unknown>).pageCount && (
      <span>{(doc.metadata as Record<string, unknown>).pageCount} стр.</span>
    )}
  </div>
)}
```

Add `FileText` to the lucide-react import at the top of the file.

- [ ] **Step 2: Verify build**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/DocumentSheet.tsx
git commit -m "feat: show file format and page count in document viewer"
```

---

### Task 6: Manual E2E test

- [ ] **Step 1: Start dev server**

```bash
cd web && npm run dev
```

- [ ] **Step 2: Test each file type**

Upload one file of each type and verify:
- TXT: text appears in document list and viewer
- MD: markdown rendered correctly
- CSV: data visible as text
- JSON: stored as document (or detected as Telegram)
- PDF: full text extracted and searchable
- DOCX: full text extracted
- XLSX: all sheets visible as CSV text

- [ ] **Step 3: Test search**

Go to Search page, search for a word that appears inside an uploaded PDF — verify it's found.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete client-side file parsing for all document types"
```

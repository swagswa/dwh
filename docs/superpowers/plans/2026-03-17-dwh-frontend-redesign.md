# DWH Frontend Redesign Plan

> Premium dark UI в стиле Claude/Supabase. Sidebar navigation, 4 страницы, поиск с фильтрами по источникам.

## Design System

### Colors (Dark Theme)
- Background: `slate-950` (#020617)
- Card/Surface: `slate-900` (#0f172a) with `slate-800` border
- Text primary: `slate-50`
- Text secondary: `slate-400`
- Accent: `blue-500` (primary actions)

### Source Colors
- ChatGPT: `emerald-500` (#10b981)
- Gmail: `red-500` (#ef4444)
- Telegram: `sky-500` (#0ea5e9)
- Sites: `amber-500` (#f59e0b)
- Documents: `violet-500` (#8b5cf6)

### Typography
- Font: Geist (already installed)
- Headings: font-semibold
- Body: font-normal, text-sm/text-base

## File Structure

```
web/src/
  lib/
    supabase.ts              # no changes
    api.ts                   # no changes
    sources.ts               # NEW: source config (colors, icons, labels)
  components/
    layout/
      Sidebar.tsx            # Left nav: logo + menu items + user
      TopBar.tsx             # Search input + breadcrumb
      AppLayout.tsx          # Combines Sidebar + TopBar + content slot
    auth/
      LoginPage.tsx          # Premium dark login
    dashboard/
      DashboardPage.tsx      # Stats overview + source cards grid
      SourceStatsCard.tsx    # Card with gradient accent, count, sync button
    search/
      SearchPage.tsx         # Search bar + source tabs + results
      SourceTabs.tsx         # Filter tabs: All | ChatGPT | Gmail | ...
      DocumentCard.tsx       # Search result card with snippet
    documents/
      DocumentsPage.tsx      # Full documents table with filters
      DocumentSheet.tsx      # Slide-over panel (right side) for document view
    settings/
      SettingsPage.tsx       # Gmail, Sites URLs, File upload sections
      FileDropZone.tsx       # Drag & drop upload zone
    shared/
      SourceBadge.tsx        # Colored badge with source icon
      EmptyState.tsx         # Beautiful empty states
  App.tsx                    # Auth + AppLayout + page routing via state
```

## Pages

### 1. Login Page
- Dark full-screen background
- Centered card with subtle glow/border gradient
- DWH logo + "Войти в систему"
- Email + password inputs (dark styled)
- Button with hover animation
- Error message inline

### 2. Dashboard (Обзор)
- Top stats bar: total docs count, sources connected, last sync time
- Grid of 5 SourceStatsCards (2-3 columns)
- Each card:
  - Source icon + name
  - Large document count number
  - Last sync relative time ("2 мин назад")
  - Sync button with spinner during sync
  - Left border or top gradient in source color
  - ChatGPT: "Через расширение" badge instead of button
  - Telegram: "Загрузите JSON" badge

### 3. Search (Поиск)
- Large centered search input (like Claude's chat input)
- Below: SourceTabs — horizontal pills: [Все] [ChatGPT] [Gmail] [Telegram] [Сайты] [Документы]
- Active tab highlighted in source color
- Results as DocumentCards:
  - Source badge (colored)
  - Title (bold)
  - Content snippet (first 150 chars, search term highlighted)
  - Date (relative)
  - Click → opens DocumentSheet
- Search queries `supabase.from('documents').select('*').ilike('title', '%query%')` + filter by source
- Also search in content: `.or('title.ilike.%q%,content.ilike.%q%')`
- Empty state: "Введите запрос для поиска"
- No results: "Ничего не найдено"

### 4. Documents (Документы)
- Same SourceTabs for filtering
- Table view (sortable by date)
- Columns: Source (badge), Title, Updated, Preview snippet
- Pagination (50 per page)
- Click row → DocumentSheet slides in from right
- DocumentSheet:
  - Header: title + source badge + dates
  - Scrollable content area (markdown-like rendering)
  - Collapsible metadata section
  - "×" close button

### 5. Settings (Настройки)
- Sections in cards:
  - **Gmail**: Connection status badge (green "Подключено" or gray "Не подключено") + Connect/Disconnect button
  - **Сайты**: URL list with add/remove. Input + "Добавить" button. Each URL has delete icon.
  - **Загрузка файлов**: FileDropZone — dashed border, drag highlight, accepts json/txt/md/csv/pdf/docx/xlsx
  - **Аккаунт**: email display + "Выйти" button

## Implementation Order

### Step 1: Foundation (sources.ts + AppLayout)
- Create `lib/sources.ts` with source config
- Create Sidebar, TopBar, AppLayout
- Update App.tsx with page routing
- Set dark theme on html/body

### Step 2: Login Page
- Redesign LoginPage with dark premium style

### Step 3: Dashboard
- DashboardPage + SourceStatsCard with gradients

### Step 4: Search
- SearchPage + SourceTabs + DocumentCard + DocumentSheet

### Step 5: Documents + Settings
- DocumentsPage (table with filters)
- SettingsPage (Gmail + Sites + Upload)

### Step 6: Polish
- Transitions/animations (page transitions, card hover, sheet slide)
- Empty states
- Loading skeletons
- Responsive (sidebar collapses on mobile)

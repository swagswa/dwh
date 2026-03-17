import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { edgeFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SourceCard } from './SourceCard'
import type { SourceStatus } from './SourceCard'
import { DocumentsTable } from './DocumentsTable'
import { SettingsPanel } from './SettingsPanel'
import { LogOut, Database } from 'lucide-react'

interface SyncStatusResponse {
  sources?: {
    [key: string]: {
      count?: number
      last_sync?: string | null
      status?: string
      error?: string
    }
  }
}

const SOURCES = [
  {
    source: 'gmail',
    label: 'Gmail',
    emoji: '📧',
    accentColor: 'bg-red-500',
    syncFn: 'sync-gmail',
  },
  {
    source: 'chatgpt',
    label: 'ChatGPT',
    emoji: '🤖',
    accentColor: 'bg-emerald-500',
    syncFn: null,
    badge: 'Через расширение',
  },
  {
    source: 'telegram',
    label: 'Telegram',
    emoji: '✈️',
    accentColor: 'bg-blue-500',
    syncFn: null,
    badge: 'Загрузите JSON',
  },
  {
    source: 'sites',
    label: 'Сайты',
    emoji: '🌐',
    accentColor: 'bg-orange-500',
    syncFn: 'sync-sites',
  },
  {
    source: 'documents',
    label: 'Файлы',
    emoji: '📁',
    accentColor: 'bg-purple-500',
    syncFn: null,
    badge: 'Загрузите файлы',
  },
]

const defaultStatus = (): SourceStatus => ({ count: 0, lastSync: null, status: 'never' })

interface Props {
  session: Session
}

export function Dashboard({ session }: Props) {
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>(
    Object.fromEntries(SOURCES.map(s => [s.source, defaultStatus()])),
  )
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    void fetchStats()
  }, [])

  async function fetchStats() {
    setStatsLoading(true)
    try {
      const res = await edgeFetch('sync-status')
      if (res.ok) {
        const data = await res.json() as SyncStatusResponse
        if (data.sources) {
          setStatuses(prev => {
            const next = { ...prev }
            for (const [src, info] of Object.entries(data.sources!)) {
              next[src] = {
                count: info.count ?? 0,
                lastSync: info.last_sync ?? null,
                status: (info.status as SourceStatus['status']) ?? 'never',
                error: info.error,
              }
            }
            return next
          })
        }
      }
    } catch {
      // stats are non-critical, silently fail
    } finally {
      setStatsLoading(false)
    }
  }

  async function syncSource(syncFn: string) {
    const res = await edgeFetch(syncFn, { method: 'POST' })
    if (!res.ok) {
      const text = await res.text().catch(() => 'Ошибка')
      throw new Error(text)
    }
    void fetchStats()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-primary" />
            <span className="font-semibold text-base tracking-tight">DWH</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">{session.user.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()} className="gap-1.5 h-8">
              <LogOut size={14} />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Source cards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Источники данных</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchStats()}
              disabled={statsLoading}
              className="text-xs h-7"
            >
              Обновить статистику
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {SOURCES.map(src => (
              <SourceCard
                key={src.source}
                source={src.source}
                label={src.label}
                emoji={src.emoji}
                accentColor={src.accentColor}
                status={statuses[src.source] ?? defaultStatus()}
                onSync={src.syncFn ? () => syncSource(src.syncFn!) : undefined}
                badgeText={src.badge}
              />
            ))}
          </div>
        </section>

        <Separator />

        {/* Documents table */}
        <section>
          <DocumentsTable />
        </section>

        <Separator />

        {/* Settings */}
        <section>
          <SettingsPanel />
        </section>
      </main>
    </div>
  )
}
